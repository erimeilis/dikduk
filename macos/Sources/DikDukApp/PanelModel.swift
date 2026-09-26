import Observation
import DikDukCore

enum PhraseState: Equatable {
    case loading
    case text(String)
    case status(String)
}

struct TermRow: Identifiable, Equatable {
    let id: Int
    let term: String
    var entry: LookupResult?
    var status: String?
}

@MainActor @Observable final class PanelModel {
    static let maxRows = 6

    let label: String
    var phrase: PhraseState = .loading
    var rows: [TermRow]
    let hiddenCount: Int
    var pinned = false

    init(label: String, terms: [String]) {
        self.label = label
        rows = terms.prefix(Self.maxRows).enumerated().map { TermRow(id: $0.offset, term: $0.element) }
        hiddenCount = max(0, terms.count - Self.maxRows)
    }
}
