import AppKit
import DikDukCore

/// Orchestrates: AX text under the pointer → cache/worker → panel (spec §2 data flow).
@MainActor final class PanelController {
    private let reader = AXReader()
    private let panel = TranslationPanel()
    private let client: WorkerClient
    private let cache: LookupCache
    private var held = false
    private var currentText: String?
    private var model: PanelModel?
    private var pending: Task<Void, Never>?
    /// Arms the pin tap only while the unpinned panel shows with the modifier held.
    var onArmChange: ((Bool) -> Void)?

    init(client: WorkerClient, cache: LookupCache) {
        self.client = client
        self.cache = cache
    }

    func holdChanged(_ isHeld: Bool, at point: CGPoint) {
        held = isHeld
        if isHeld {
            pointerMoved(to: point)
        } else if model?.pinned != true {
            dismiss()
        }
        updateArm()
    }

    func pointerMoved(to point: CGPoint) {
        guard held, model?.pinned != true else { return }
        guard let text = reader.text(at: Self.topLeft(point)) else {
            dismiss()
            return
        }
        if text == currentText {
            if panel.isVisible { panel.move(near: point) }
            return
        }
        currentText = text
        pending?.cancel()
        panel.hide()
        updateArm()
        pending = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(120))
            guard !Task.isCancelled else { return }
            await self?.present(text)
        }
    }

    /// The pin tap swallowed a ⌥+click: make the panel stay and accept clicks.
    func pin() {
        guard let model, panel.isVisible else { return }
        model.pinned = true
        panel.setInteractive(true)
        updateArm()
    }

    /// A click in another app (global monitors never see our own panel's clicks).
    func outsideClick() {
        if model?.pinned == true { dismiss() }
    }

    func escapePressed() {
        if model?.pinned == true { dismiss() }
    }

    func dismiss() {
        pending?.cancel()
        pending = nil
        currentText = nil
        model = nil
        panel.hide()
        updateArm()
    }

    private func updateArm() {
        onArmChange?(held && panel.isVisible && model?.pinned == false)
    }

    private func present(_ text: String) async {
        let model = PanelModel(label: text, terms: HebrewText.terms(text))
        self.model = model
        panel.show(model, near: NSEvent.mouseLocation) { [weak self] entry in self?.open(entry) }
        updateArm()
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadPhrase(model) }
            for row in model.rows {
                group.addTask { await self.loadRow(model, index: row.id) }
            }
        }
    }

    private func loadPhrase(_ model: PanelModel) async {
        let key = LookupCache.translationKey(model.label)
        if case .translation(let cached)? = await cache.get(key) {
            model.phrase = .text(cached)
        } else {
            do {
                let translation = try await client.translate(model.label)
                await cache.set(key, .translation(translation))
                model.phrase = .text(translation)
            } catch is CancellationError {
                return
            } catch {
                log.error("translate failed: \(String(describing: error), privacy: .public)")
                model.phrase = .status(Self.phraseStatus(error))
            }
        }
        if self.model === model { panel.refit() }
    }

    private func loadRow(_ model: PanelModel, index: Int) async {
        let term = model.rows[index].term
        let key = LookupCache.lookupKey(term)
        if case .lookup(let cached)? = await cache.get(key) {
            model.rows[index].entry = cached
        } else {
            do {
                let entry = try await client.lookup(term)
                await cache.set(key, .lookup(entry))
                model.rows[index].entry = entry
            } catch is CancellationError {
                return
            } catch {
                log.error("lookup \(term, privacy: .public) failed: \(String(describing: error), privacy: .public)")
                model.rows[index].status = Self.rowStatus(error)
            }
        }
        if self.model === model { panel.refit() }
    }

    private func open(_ entry: LookupResult) {
        if let url = URL(string: entry.sourceUrl) { NSWorkspace.shared.open(url) }
        dismiss()
    }

    static func phraseStatus(_ error: Error) -> String {
        switch error as? WorkerError {
        case .budget: "translation paused (monthly limit)"
        case .needsKey: "add your AI key (menu › AI key…)"
        case .badKey: "AI key rejected — check it in AI key…"
        case .offline: "offline"
        default: "translation unavailable"
        }
    }

    static func rowStatus(_ error: Error) -> String {
        switch error as? WorkerError {
        case .noResults: "not in dictionary"
        case .offline: "offline"
        default: "lookup unavailable"
        }
    }

    private static var primaryHeight: CGFloat { NSScreen.screens.first?.frame.height ?? 0 }
    static func topLeft(_ cocoa: CGPoint) -> CGPoint { CGPoint(x: cocoa.x, y: primaryHeight - cocoa.y) }}
