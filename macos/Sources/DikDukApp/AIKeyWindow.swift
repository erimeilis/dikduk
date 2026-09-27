import AppKit
import SwiftUI
import DikDukCore

/// "AI key…" settings window (spec §4): pick a provider, paste the key, Test, Save.
@MainActor final class AIKeyWindowController {
    private let store: CredentialStore
    private let baseURL: URL
    private let onSaved: () -> Void
    private var window: NSWindow?

    init(store: CredentialStore, baseURL: URL, onSaved: @escaping () -> Void) {
        self.store = store
        self.baseURL = baseURL
        self.onSaved = onSaved
    }

    func show() {
        if window == nil {
            let view = AIKeyView(store: store, baseURL: baseURL, onSaved: onSaved) { [weak self] in self?.window?.close() }
            let window = NSWindow(contentViewController: NSHostingController(rootView: view))
            window.title = "DikDuk — AI key"
            window.styleMask = [.titled, .closable]
            window.isReleasedWhenClosed = false
            self.window = window
        }
        NSApp.activate()
        window?.center()
        window?.makeKeyAndOrderFront(nil)
    }
}

private struct AIKeyView: View {
    let store: CredentialStore
    let baseURL: URL
    let onSaved: () -> Void
    let close: () -> Void

    @State private var provider: AIProvider = .gemini
    @State private var key = ""
    @State private var account = ""
    @State private var result = ""

    var body: some View {
        Form {
            Picker("Provider", selection: $provider) {
                Text("Google Gemini").tag(AIProvider.gemini)
                Text("Cloudflare Workers AI").tag(AIProvider.workersAI)
                Text("DikDuk owner token").tag(AIProvider.owner)
            }
            SecureField(provider == .workersAI ? "API token" : "Key", text: $key)
            if provider == .workersAI { TextField("Account ID", text: $account) }
            Text(help).font(.caption).foregroundStyle(.secondary)
            if !result.isEmpty { Text(result).font(.caption) }
            HStack {
                Button("Test") { Task { await test() } }.disabled(candidate == nil)
                Spacer()
                Button("Remove") { remove() }
                Button("Save") { save() }.keyboardShortcut(.defaultAction).disabled(candidate == nil)
            }
        }
        .padding(16)
        .frame(width: 420)
        .onAppear(perform: loadCurrent)
    }

    private var help: String {
        switch provider {
        case .gemini: "Create a key at Google AI Studio (aistudio.google.com › Get API key)."
        case .workersAI: "Cloudflare dashboard › My Profile › API Tokens: a token with Workers AI permission, plus your account ID."
        case .owner: "The OWNER_TOKEN secret of your own DikDuk worker."
        }
    }

    private var candidate: AICredentials? {
        let k = key.trimmingCharacters(in: .whitespacesAndNewlines)
        let a = account.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !k.isEmpty else { return nil }
        switch provider {
        case .gemini: return .gemini(key: k)
        case .workersAI: return a.isEmpty ? nil : .workersAI(token: k, accountId: a)
        case .owner: return .owner(token: k)
        }
    }

    private func loadCurrent() {
        let loaded: AICredentials?
        do {
            loaded = try store.load()
        } catch {
            result = "✗ Could not read the Keychain: \(error)"
            return
        }
        guard let current = loaded else { return }
        provider = current.provider
        switch current {
        case .gemini(let k): key = k
        case .workersAI(let t, let a): key = t; account = a
        case .owner(let t): key = t
        }
    }

    private func test() async {
        guard let creds = candidate else { return }
        result = "Testing…"
        // A fresh phrase each time: a cached label would answer without ever
        // reaching the provider, so a wrong key could still look fine.
        let probe = "בדיקת מפתח \(Int.random(in: 1000...9999))"
        do {
            let t = try await WorkerClient(baseURL: baseURL, credentials: { creds }).translate(probe)
            result = "✓ Key works (\(t))"
        } catch {
            result = "✗ \(Self.describe(error))"
        }
    }

    private static func describe(_ error: Error) -> String {
        switch error as? WorkerError {
        case .badKey: "The provider rejected this key."
        case .needsKey: "No key was sent."
        case .budget: "The owner's monthly AI budget is used up."
        case .offline: "Can't reach the DikDuk worker (offline?)."
        case .noResults: "No result."
        case .upstream(let message): message
        case nil: String(describing: error)
        }
    }

    private func save() {
        guard let creds = candidate else { return }
        do {
            try store.save(creds)
            onSaved()
            close()
        } catch {
            result = "✗ Could not save to Keychain: \(error)"
        }
    }

    private func remove() {
        do {
            try store.clear()
            key = ""
            account = ""
            result = "Removed."
            onSaved()
        } catch {
            result = "✗ Could not remove from Keychain: \(error)"
        }
    }
}
