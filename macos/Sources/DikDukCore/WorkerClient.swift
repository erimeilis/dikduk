import Foundation

public struct SeeAlsoRef: Codable, Equatable, Sendable {
    public let label: String
    public let slug: String
}

/// The fields of the worker's LookupResult (extension/src/contracts/lookup.ts)
/// the panel shows. Unknown fields are ignored by the decoder.
public struct LookupResult: Codable, Equatable, Sendable {
    public let word: String
    public let lemma: String
    public let slug: String
    public let translation: String
    public let root: String
    public let isVerb: Bool
    public let seeAlso: [SeeAlsoRef]
    public let sourceUrl: String
}

public enum WorkerError: Error, Equatable, Sendable {
    case noResults
    case budget
    case offline
    case needsKey
    case badKey
    case upstream(String)
}

private struct ErrorBody: Decodable {
    let error: String
    let code: String
}

private struct TranslateBody: Decodable {
    let translation: String
}

public struct WorkerClient: Sendable {
    public static let defaultBaseURL = URL(string: "https://pealim-lookup.admice.workers.dev")!
    public static let defaultTimeout: TimeInterval = 8
    private static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .timedOut,
        .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed,
    ]

    let baseURL: URL
    let session: URLSession
    /// Total deadline per request. URLRequest.timeoutInterval alone is an idle
    /// timeout, so a slowly trickling response could outlive it.
    let timeout: TimeInterval
    /// Read per request, so a key saved in settings applies without a relaunch.
    let credentials: @Sendable () -> AICredentials?

    public init(
        baseURL: URL = WorkerClient.defaultBaseURL,
        session: URLSession = .shared,
        timeout: TimeInterval = WorkerClient.defaultTimeout,
        credentials: @escaping @Sendable () -> AICredentials? = { nil }
    ) {
        self.baseURL = baseURL
        self.session = session
        self.timeout = timeout
        self.credentials = credentials
    }

    public func lookup(_ term: String) async throws -> LookupResult {
        var components = URLComponents(url: baseURL.appending(path: "lookup"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "q", value: term)]
        return try await send(URLRequest(url: components.url!), as: LookupResult.self, withKey: false)
    }

    public func translate(_ text: String) async throws -> String {
        var request = URLRequest(url: baseURL.appending(path: "translate"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["text": text])
        return try await send(request, as: TranslateBody.self, withKey: true).translation
    }

    /// `withKey`: only AI calls carry the key; /lookup never needs one.
    private func send<T: Decodable>(_ request: URLRequest, as type: T.Type, withKey: Bool) async throws -> T {
        var request = request
        request.timeoutInterval = timeout
        if withKey {
            for (name, value) in credentials()?.headers ?? [:] { request.setValue(value, forHTTPHeaderField: name) }
        }
        let data: Data
        do {
            data = try await fetchWithDeadline(request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch let error as URLError where Self.offlineCodes.contains(error.code) {
            throw WorkerError.offline
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw WorkerError.upstream(error.localizedDescription)
        }
        // The worker signals failures (including 200 BUDGET) with a `code` field.
        if let body = try? JSONDecoder().decode(ErrorBody.self, from: data) {
            switch body.code {
            case "NO_RESULTS": throw WorkerError.noResults
            case "BUDGET": throw WorkerError.budget
            case "NEEDS_KEY": throw WorkerError.needsKey
            case "BAD_KEY": throw WorkerError.badKey
            default: throw WorkerError.upstream(body.error)
            }
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw WorkerError.upstream("Unexpected response: \(error)")
        }
    }

    /// Races the request against the total deadline; the loser is cancelled.
    private func fetchWithDeadline(_ request: URLRequest) async throws -> Data {
        let session = self.session
        let deadline = timeout
        return try await withThrowingTaskGroup(of: Data.self) { group in
            group.addTask { try await session.data(for: request).0 }
            group.addTask {
                try await Task.sleep(for: .seconds(deadline))
                throw URLError(.timedOut)
            }
            defer { group.cancelAll() }
            guard let data = try await group.next() else { throw URLError(.unknown) }
            return data
        }
    }
}
