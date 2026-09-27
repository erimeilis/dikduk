public enum AIProvider: String, CaseIterable, Sendable {
    case gemini
    case workersAI = "workers-ai"
    case owner
}

/// Who pays for AI calls (spec §3.1). Sent to the worker on every request.
public enum AICredentials: Equatable, Sendable {
    case gemini(key: String)
    case workersAI(token: String, accountId: String)
    case owner(token: String)

    public var provider: AIProvider {
        switch self {
        case .gemini: .gemini
        case .workersAI: .workersAI
        case .owner: .owner
        }
    }

    /// Secrets travel only in Authorization; X-DikDuk-Provider says whose key it is.
    public var headers: [String: String] {
        switch self {
        case .gemini(let key):
            ["Authorization": "Bearer \(key)", "X-DikDuk-Provider": "gemini"]
        case .workersAI(let token, let accountId):
            ["Authorization": "Bearer \(token)", "X-DikDuk-Provider": "workers-ai", "X-DikDuk-Account": accountId]
        case .owner(let token):
            ["Authorization": "Bearer \(token)"]
        }
    }
}
