import Foundation
import Testing
@testable import DikDukCore

@Suite(.serialized) struct WorkerClientTests {
    let client: WorkerClient = {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return WorkerClient(baseURL: URL(string: "https://w.test")!, session: URLSession(configuration: config))
    }()

    func fixture(_ name: String) throws -> Data {
        let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    static func json(_ object: [String: String]) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }

    @Test func decodesRecordedLookup() async throws {
        let body = try fixture("lookup-hagdarot")
        StubURLProtocol.handler = { _ in (200, body) }
        let result = try await client.lookup("הגדרות")
        #expect(result.lemma == "גָּדֵר")
        #expect(result.translation == "fence")
        #expect(result.root == "ג־ד־ר")
        #expect(result.seeAlso.map(\.label).contains("הַגְדָּרָה"))
        #expect(result.sourceUrl == "https://www.pealim.com/dict/4570-gader/")
    }

    @Test func lookupSendsTheTermAsQ() async throws {
        let body = try fixture("lookup-hagdarot")
        StubURLProtocol.handler = { _ in (200, body) }
        _ = try await client.lookup("הגדרות")
        let url = try #require(StubURLProtocol.lastRequest?.url)
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(components.path == "/lookup")
        #expect(components.queryItems?.first(where: { $0.name == "q" })?.value == "הגדרות")
    }

    @Test func noResultsMapsToNoResults() async {
        StubURLProtocol.handler = { _ in (404, Self.json(["error": "No results", "code": "NO_RESULTS"])) }
        await #expect(throws: WorkerError.noResults) { try await client.lookup("קקקק") }
    }

    @Test func translatePostsTextAndReturnsTranslation() async throws {
        StubURLProtocol.handler = { _ in (200, Self.json(["translation": "Settings"])) }
        let translation = try await client.translate("הגדרות")
        #expect(translation == "Settings")
        let request = try #require(StubURLProtocol.lastRequest)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.path == "/translate")
        let sent = try JSONSerialization.jsonObject(with: try #require(StubURLProtocol.lastBody)) as? [String: String]
        #expect(sent == ["text": "הגדרות"])
    }

    @Test func budgetBodyMapsToBudgetEvenWith200() async {
        StubURLProtocol.handler = { _ in (200, Self.json(["error": "Monthly translation budget reached", "code": "BUDGET"])) }
        await #expect(throws: WorkerError.budget) { try await client.translate("הגדרות") }
    }

    @Test func upstreamMapsToUpstream() async {
        StubURLProtocol.handler = { _ in (502, Self.json(["error": "Translation failed: boom", "code": "UPSTREAM"])) }
        await #expect(throws: WorkerError.upstream("Translation failed: boom")) { try await client.translate("הגדרות") }
    }

    @Test func noNetworkIsOffline() async {
        StubURLProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }
        await #expect(throws: WorkerError.offline) { try await client.lookup("הגדרות") }
    }

    @Test func timedOutIsOffline() async {
        StubURLProtocol.handler = { _ in throw URLError(.timedOut) }
        await #expect(throws: WorkerError.offline) { try await client.translate("הגדרות") }
    }

    @Test func garbageBodyIsUpstream() async {
        StubURLProtocol.handler = { _ in (200, Data("<html>".utf8)) }
        await #expect(throws: WorkerError.self) { try await client.lookup("הגדרות") }
    }

    @Test func slowResponseHitsTheTotalDeadline() async {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        let quick = WorkerClient(
            baseURL: URL(string: "https://w.test")!,
            session: URLSession(configuration: config),
            timeout: 0.2
        )
        StubURLProtocol.handler = { _ in
            Thread.sleep(forTimeInterval: 1) // a worker that answers too slowly
            return (200, Self.json(["translation": "Settings"]))
        }
        await #expect(throws: WorkerError.offline) { try await quick.translate("הגדרות") }
    }

    @Test func requestsTimeOutAfterEightSeconds() async throws {
        StubURLProtocol.handler = { _ in (200, Self.json(["translation": "Settings"])) }
        _ = try await client.translate("הגדרות")
        #expect(StubURLProtocol.lastRequest?.timeoutInterval == 8)
    }
}
