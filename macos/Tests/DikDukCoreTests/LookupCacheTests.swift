import Foundation
import Testing
@testable import DikDukCore

@Suite struct LookupCacheTests {
    func tempFile() -> URL {
        FileManager.default.temporaryDirectory
            .appending(path: "dikduk-cache-\(UUID().uuidString)")
            .appending(path: "cache.json")
    }

    @Test func evictsLeastRecentlyUsed() async {
        let cache = LookupCache(capacity: 2, fileURL: nil)
        await cache.set("a", .translation("A"))
        await cache.set("b", .translation("B"))
        _ = await cache.get("a")               // a is now most recent
        await cache.set("c", .translation("C")) // evicts b
        #expect(await cache.get("b") == nil)
        #expect(await cache.get("a") == .translation("A"))
        #expect(await cache.get("c") == .translation("C"))
        #expect(await cache.count == 2)
    }

    @Test func persistsAcrossInstances() async throws {
        let file = tempFile()
        let first = LookupCache(fileURL: file)
        await first.set(LookupCache.translationKey("הגדרות"), .translation("Settings"))
        try await first.flush()

        let second = LookupCache(fileURL: file)
        #expect(await second.get(LookupCache.translationKey("הגדרות")) == .translation("Settings"))
    }

    @Test func corruptFileStartsEmpty() async throws {
        let file = tempFile()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("not json".utf8).write(to: file)
        let cache = LookupCache(fileURL: file)
        #expect(await cache.count == 0)
        await cache.set("k", .translation("v"))
        try await cache.flush() // overwrites the corrupt file
        #expect(await LookupCache(fileURL: file).get("k") == .translation("v"))
    }

    @Test func flushWithoutChangesWritesNothing() async throws {
        let file = tempFile()
        let cache = LookupCache(fileURL: file)
        try await cache.flush()
        #expect(!FileManager.default.fileExists(atPath: file.path))
    }

    @Test func loadTrimsToCapacityAndKeepsEntriesMissingFromOrder() async throws {
        let file = tempFile()
        let big = LookupCache(capacity: 10, fileURL: file)
        for i in 0..<5 { await big.set("k\(i)", .translation("v\(i)")) }
        try await big.flush()

        let small = LookupCache(capacity: 3, fileURL: file)
        #expect(await small.count == 3)
        #expect(await small.get("k4") == .translation("v4")) // most recent survive
        #expect(await small.get("k0") == nil)
    }

    @Test func keysIgnoreNiqqud() {
        #expect(LookupCache.lookupKey("שָׁלוֹם") == LookupCache.lookupKey("שלום"))
        #expect(LookupCache.translationKey("שלום") != LookupCache.lookupKey("שלום"))
    }
}
