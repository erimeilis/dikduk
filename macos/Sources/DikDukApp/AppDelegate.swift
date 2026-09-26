import AppKit
import DikDukCore

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    let settings = Settings()
    private let cache = LookupCache(fileURL: LookupCache.defaultFileURL())
    private lazy var controller = PanelController(client: WorkerClient(baseURL: settings.workerURL), cache: cache)
    private let watcher = ModifierWatcher()
    private let clicks = ClickInterceptor()
    private(set) var status: StatusItem!
    private var trustTimer: Timer?
    private var flushTimer: Timer?
    private var escapeMonitor: Any?
    private var outsideClickMonitor: Any?
    private var running = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        status = StatusItem(settings: settings)
        status.onChange = { [weak self] in self?.applySettings() }
        watcher.onHoldChange = { [weak self] held, point in self?.controller.holdChanged(held, at: point) }
        watcher.onMove = { [weak self] point in self?.controller.pointerMoved(to: point) }
        clicks.onPin = { [weak self] in self?.controller.pin() }
        controller.onArmChange = { [clicks] armed in clicks.setArmed(armed) }

        let trusted = Permissions.isTrusted(prompt: true)
        status.setTrusted(trusted)
        if trusted { applySettings() } else { waitForTrust() }

        flushTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.flushCache() }
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        Task {
            await flushNow()
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }

    private func waitForTrust() {
        trustTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, Permissions.isTrusted(prompt: false) else { return }
                self.trustTimer?.invalidate()
                self.trustTimer = nil
                self.status.setTrusted(true)
                self.applySettings()
            }
        }
    }

    func applySettings() {
        watcher.required = settings.modifier.flags
        let shouldRun = settings.enabled && Permissions.isTrusted(prompt: false)
        guard shouldRun != running else { return }
        running = shouldRun
        if shouldRun {
            watcher.start()
            clicks.start()
            escapeMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard event.keyCode == 53 else { return } // Esc
                MainActor.assumeIsolated { self?.controller.escapePressed() }
            }
            // Listen-only: never delays clicks; never sees clicks inside our own panel.
            outsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown) { [weak self] _ in
                MainActor.assumeIsolated { self?.controller.outsideClick() }
            }
        } else {
            watcher.stop()
            clicks.stop()
            for monitor in [escapeMonitor, outsideClickMonitor].compactMap({ $0 }) { NSEvent.removeMonitor(monitor) }
            escapeMonitor = nil
            outsideClickMonitor = nil
            controller.dismiss()
        }
        log.info("running=\(shouldRun) modifier=\(self.settings.modifier.rawValue, privacy: .public)")
    }

    private func flushCache() {
        Task { await flushNow() }
    }

    private func flushNow() async {
        do {
            try await cache.flush()
            status?.setWarning(nil)
        } catch {
            log.error("cache flush failed: \(error.localizedDescription, privacy: .public)")
            status?.setWarning("Cache not saved: \(error.localizedDescription)")
        }
    }
}
