import Foundation
import Testing
@testable import DikDukCore

@Suite(.serialized) struct CredentialTests {
    let service = "dev.dikduk.companion.tests.\(UUID().uuidString)"

    @Test func headersPerProvider() {
        #expect(AICredentials.gemini(key: "g").headers == ["Authorization": "Bearer g", "X-DikDuk-Provider": "gemini"])
        #expect(AICredentials.workersAI(token: "t", accountId: "a").headers ==
            ["Authorization": "Bearer t", "X-DikDuk-Provider": "workers-ai", "X-DikDuk-Account": "a"])
        #expect(AICredentials.owner(token: "o").headers == ["Authorization": "Bearer o"])
    }

    @Test func keychainRoundTrip() throws {
        let keychain = KeychainStore(service: service)
        try keychain.set("secret", account: "gemini")
        #expect(try keychain.get("gemini") == "secret")
        try keychain.set("rotated", account: "gemini")
        #expect(try keychain.get("gemini") == "rotated")
        try keychain.remove("gemini")
        #expect(try keychain.get("gemini") == nil)
    }

    @Test func credentialStoreRoundTripsEachProvider() throws {
        let defaults = UserDefaults(suiteName: service)!
        let store = CredentialStore(keychain: KeychainStore(service: service), defaults: defaults)
        for creds in [AICredentials.gemini(key: "g"), .workersAI(token: "t", accountId: "a"), .owner(token: "o")] {
            try store.save(creds)
            #expect(try store.load() == creds)
        }
        try store.clear()
        #expect(try store.load() == nil)
        defaults.removePersistentDomain(forName: service)
    }

    @Test func saveTrimsWhitespace() throws {
        let defaults = UserDefaults(suiteName: service)!
        let store = CredentialStore(keychain: KeychainStore(service: service), defaults: defaults)
        try store.save(.gemini(key: "  g-key \n"))
        #expect(try store.load() == .gemini(key: "g-key"))
        try store.clear()
        defaults.removePersistentDomain(forName: service)
    }

    @Test func switchingProviderRemovesTheOldSecret() throws {
        let keychain = KeychainStore(service: service)
        let defaults = UserDefaults(suiteName: service)!
        let store = CredentialStore(keychain: keychain, defaults: defaults)
        try store.save(.gemini(key: "g"))
        try store.save(.owner(token: "o"))
        #expect(try keychain.get("gemini") == nil)
        #expect(try store.load() == .owner(token: "o"))
        try store.clear()
        defaults.removePersistentDomain(forName: service)
    }
}
