import Foundation

/// Secrets in the Keychain; only the chosen provider name in UserDefaults.
public final class CredentialStore: @unchecked Sendable {
    public static let providerKey = "aiProvider"
    private let keychain: KeychainStore
    private let defaults: UserDefaults

    public init(keychain: KeychainStore, defaults: UserDefaults) {
        self.keychain = keychain
        self.defaults = defaults
    }

    private static let accounts: [AIProvider: [String]] = [
        .gemini: ["gemini"],
        .workersAI: ["workers-ai", "workers-ai-account"],
        .owner: ["owner"],
    ]

    public func load() throws -> AICredentials? {
        guard let raw = defaults.string(forKey: Self.providerKey), let provider = AIProvider(rawValue: raw) else { return nil }
        switch provider {
        case .gemini:
            return try keychain.get("gemini").map { .gemini(key: $0) }
        case .workersAI:
            guard let token = try keychain.get("workers-ai"), let account = try keychain.get("workers-ai-account") else { return nil }
            return .workersAI(token: token, accountId: account)
        case .owner:
            return try keychain.get("owner").map { .owner(token: $0) }
        }
    }

    public func save(_ credentials: AICredentials) throws {
        let trim = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        // Write the new secret first, then drop the others: a failed write leaves
        // the previously working key in place.
        switch credentials {
        case .gemini(let key):
            try keychain.set(trim(key), account: "gemini")
        case .workersAI(let token, let accountId):
            try keychain.set(trim(token), account: "workers-ai")
            try keychain.set(trim(accountId), account: "workers-ai-account")
        case .owner(let token):
            try keychain.set(trim(token), account: "owner")
        }
        defaults.set(credentials.provider.rawValue, forKey: Self.providerKey)
        for (provider, accounts) in Self.accounts where provider != credentials.provider {
            for account in accounts { try keychain.remove(account) }
        }
    }

    public func clear() throws {
        for account in ["gemini", "workers-ai", "workers-ai-account", "owner"] { try keychain.remove(account) }
        defaults.removeObject(forKey: Self.providerKey)
    }
}
