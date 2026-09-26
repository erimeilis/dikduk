import Foundation
import OSLog

public enum CacheValue: Codable, Equatable, Sendable {
    case translation(String)
    case lookup(LookupResult)
}

/// In-memory LRU of worker results, persisted as one JSON file.
/// Only successful results are stored (callers never cache errors).
public actor LookupCache {
    private struct Snapshot: Codable {
        var order: [String]
        var entries: [String: CacheValue]
    }

    private static let log = Logger(subsystem: "dev.dikduk.companion", category: "dikduk")

    private let capacity: Int
    private let fileURL: URL?
    private var entries: [String: CacheValue] = [:]
    private var order: [String] = [] // least recent first
    private var dirty = false

    public static func defaultFileURL() -> URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appending(path: "DikDuk/cache.json")
    }

    public static func translationKey(_ text: String) -> String { "t:" + HebrewText.stripNiqqud(text) }
    public static func lookupKey(_ term: String) -> String { "l:" + HebrewText.stripNiqqud(term) }

    public init(capacity: Int = 5000, fileURL: URL?) {
        self.capacity = capacity
        self.fileURL = fileURL
        guard let fileURL, FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let snapshot = try JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: fileURL))
            // Rebuild a consistent order: keys the file lists (dropping unknown
            // ones), with any entry it forgot put first so it can still be evicted.
            let listed = snapshot.order.filter { snapshot.entries[$0] != nil }
            let listedSet = Set(listed)
            let unlisted = snapshot.entries.keys.filter { !listedSet.contains($0) }.sorted()
            var order = unlisted + listed
            var entries = snapshot.entries
            while order.count > capacity { entries[order.removeFirst()] = nil }
            self.order = order
            self.entries = entries
        } catch {
            Self.log.error("cache file unreadable, starting empty: \(error.localizedDescription, privacy: .public)")
        }
    }

    public var count: Int { entries.count }

    public func get(_ key: String) -> CacheValue? {
        guard let value = entries[key] else { return nil }
        touch(key)
        return value
    }

    public func set(_ key: String, _ value: CacheValue) {
        entries[key] = value
        touch(key)
        while order.count > capacity {
            entries[order.removeFirst()] = nil
        }
        dirty = true
    }

    /// Writes the cache file if anything was added since the last write.
    public func flush() throws {
        guard let fileURL, dirty else { return }
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(Snapshot(order: order, entries: entries))
        try data.write(to: fileURL, options: .atomic)
        dirty = false
    }

    private func touch(_ key: String) {
        if let index = order.firstIndex(of: key) { order.remove(at: index) }
        order.append(key)
    }
}
