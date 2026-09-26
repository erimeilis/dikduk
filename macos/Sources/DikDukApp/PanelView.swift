import SwiftUI
import DikDukCore

struct PanelView: View {
    let model: PanelModel
    let openEntry: (LookupResult) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(model.label)
                .font(.system(size: 13))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .multilineTextAlignment(.trailing)
            phraseLine
            if !model.rows.isEmpty { Divider() }
            ForEach(model.rows) { row in rowView(row) }
            if model.hiddenCount > 0 {
                Text("+\(model.hiddenCount) more").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .frame(width: 320, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder private var phraseLine: some View {
        switch model.phrase {
        case .loading: Text("…").font(.system(size: 16)).foregroundStyle(.secondary)
        case .text(let text): Text(text).font(.system(size: 16, weight: .semibold))
        case .status(let text): Text(text).font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }

    /// Laid out right-to-left (spec §3): term → lemma first on the right, then
    /// meaning and root. "←" points from the term to its lemma in RTL reading order.
    private func rowView(_ row: TermRow) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                if let entry = row.entry {
                    Text("\(row.term) ← \(entry.lemma)")
                    Text(entry.translation).environment(\.layoutDirection, .leftToRight)
                    Text(entry.root).foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                } else {
                    Text(row.term)
                    Text(row.status ?? "…").foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                }
            }
            .font(.system(size: 12))
            if let entry = row.entry, !entry.seeAlso.isEmpty {
                Text("also: " + entry.seeAlso.prefix(4).map(\.label).joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .contentShape(Rectangle())
        .onTapGesture {
            if model.pinned, let entry = row.entry { openEntry(entry) }
        }
    }
}
