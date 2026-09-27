import Foundation
import Security

/// Generic-password items under one Keychain service.
public struct KeychainStore: Sendable {
    public struct Failure: Error, Equatable {
        public let status: OSStatus
    }

    let service: String

    public init(service: String) {
        self.service = service
    }

    private func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    /// nil only when there is no such item; any other Keychain failure (locked,
    /// access denied) throws, so it can't be mistaken for "no key saved".
    public func get(_ account: String) throws -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw Failure(status: status) }
        return String(data: data, encoding: .utf8)
    }

    public func set(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let status = SecItemUpdate(query(account) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = query(account)
            add[kSecValueData as String] = data
            let added = SecItemAdd(add as CFDictionary, nil)
            guard added == errSecSuccess else { throw Failure(status: added) }
        } else if status != errSecSuccess {
            throw Failure(status: status)
        }
    }

    public func remove(_ account: String) throws {
        let status = SecItemDelete(query(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure(status: status) }
    }
}
