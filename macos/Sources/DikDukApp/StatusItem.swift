import AppKit

@MainActor final class StatusItem: NSObject {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let settings: Settings
    private var trusted = false
    private var warning: String?
    enum KeyState: Equatable {
        case present
        case missing
        case keychainError(String)
    }

    private var keyState = KeyState.present
    var onChange: (() -> Void)?
    var onOpenAIKey: (() -> Void)?

    /// Shows when AI translation is off: no key saved, or the Keychain can't be read.
    func setKeyState(_ state: KeyState) {
        guard state != keyState else { return }
        keyState = state
        rebuild()
    }

    /// Shows a problem (e.g. the cache file can't be saved) at the top of the menu.
    func setWarning(_ message: String?) {
        guard message != warning else { return }
        warning = message
        rebuild()
    }

    init(settings: Settings) {
        self.settings = settings
        super.init()
        item.button?.image = NSImage(systemSymbolName: "character.bubble", accessibilityDescription: "DikDuk")
        rebuild()
    }

    func setTrusted(_ value: Bool) {
        trusted = value
        rebuild()
    }

    private func rebuild() {
        item.button?.appearsDisabled = !trusted || !settings.enabled
        let menu = NSMenu()
        if let warning {
            let line = NSMenuItem(title: "⚠︎ \(warning)", action: nil, keyEquivalent: "")
            line.isEnabled = false
            menu.addItem(line)
            menu.addItem(.separator())
        }
        if let keyLine = keyStateLine {
            let line = NSMenuItem(title: keyLine, action: nil, keyEquivalent: "")
            line.isEnabled = false
            menu.addItem(line)
            menu.addItem(.separator())
        }
        if !trusted {
            let grant = NSMenuItem(title: "Open Accessibility settings", action: #selector(openAccessibility), keyEquivalent: "")
            grant.target = self
            menu.addItem(grant)
            menu.addItem(.separator())
        }
        let enabled = NSMenuItem(title: "Enabled", action: #selector(toggleEnabled), keyEquivalent: "")
        enabled.target = self
        enabled.state = settings.enabled ? .on : .off
        menu.addItem(enabled)
        menu.addItem(.separator())
        for modifier in TriggerModifier.allCases {
            let entry = NSMenuItem(title: modifier.title, action: #selector(pickModifier(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = modifier.rawValue
            entry.state = settings.modifier == modifier ? .on : .off
            menu.addItem(entry)
        }
        menu.addItem(.separator())
        let aiKey = NSMenuItem(title: "AI key…", action: #selector(openAIKey), keyEquivalent: "")
        aiKey.target = self
        menu.addItem(aiKey)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit DikDuk", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        item.menu = menu
    }

    @objc private func openAccessibility() { Permissions.openAccessibilitySettings() }

    @objc private func openAIKey() { onOpenAIKey?() }

    private var keyStateLine: String? {
        switch keyState {
        case .present: nil
        case .missing: "No AI key — translations from cache only"
        case .keychainError(let message): "⚠︎ Keychain error: \(message)"
        }
    }

    @objc private func toggleEnabled() {
        settings.enabled.toggle()
        rebuild()
        onChange?()
    }

    @objc private func pickModifier(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let modifier = TriggerModifier(rawValue: raw) else { return }
        settings.modifier = modifier
        rebuild()
        onChange?()
    }
}
