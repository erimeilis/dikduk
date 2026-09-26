import Foundation

/// Hebrew text primitives. Same rules as extension/src/shared/hebrew.ts, so the
/// app and the extension agree on what counts as a Hebrew term.
public enum HebrewText {
    /// Longest label sent to the worker (matches the worker's MAX_TRANSLATE_CHARS).
    public static let maxLabelLength = 200

    static func isLetter(_ s: Unicode.Scalar) -> Bool {
        (0x05D0...0x05EA).contains(s.value)
    }

    /// Niqqud + cantillation (U+0591–U+05C7), the range stripDiacritics removes.
    static func isMark(_ s: Unicode.Scalar) -> Bool {
        (0x0591...0x05C7).contains(s.value)
    }

    static func isZeroWidth(_ s: Unicode.Scalar) -> Bool {
        switch s.value {
        case 0x200B...0x200F, 0x202A...0x202E, 0x2060, 0xFEFF: return true
        default: return false
        }
    }

    /// Geresh, gershayim and ASCII quotes stay inside a token (acronyms like צה״ל).
    private static let inWordSymbols: Set<Unicode.Scalar> = ["\u{05F3}", "\u{05F4}", "'", "\""]

    public static func containsHebrew(_ text: String) -> Bool {
        text.unicodeScalars.contains(where: isLetter)
    }

    public static func stripNiqqud(_ text: String) -> String {
        var out = String.UnicodeScalarView()
        out.append(contentsOf: text.unicodeScalars.filter { !isMark($0) && !isZeroWidth($0) })
        return String(out)
    }

    /// Hebrew tokens in order: a letter followed by letters, marks or in-word symbols.
    public static func tokens(_ text: String) -> [String] {
        var out: [String] = []
        var current = String.UnicodeScalarView()
        for s in text.unicodeScalars {
            if current.isEmpty {
                if isLetter(s) { current.append(s) }
            } else if isLetter(s) || isMark(s) || inWordSymbols.contains(s) {
                current.append(s)
            } else {
                out.append(String(current))
                current = String.UnicodeScalarView()
            }
        }
        if !current.isEmpty { out.append(String(current)) }
        return out
    }

    /// Tokens not worth looking up: mixed Latin/digits, acronyms, under 2 letters.
    public static func shouldSkip(_ token: String) -> Bool {
        if token.range(of: "[A-Za-z0-9]", options: .regularExpression) != nil { return true }
        if token.unicodeScalars.contains(where: inWordSymbols.contains) { return true }
        return stripNiqqud(token).unicodeScalars.filter(isLetter).count < 2
    }

    /// Terms to look up, in order, de-duplicated by their niqqud-free form.
    public static func terms(_ text: String) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for token in tokens(text) where !shouldSkip(token) {
            if seen.insert(stripNiqqud(token)).inserted { out.append(token) }
        }
        return out
    }

    /// Cuts text longer than `max` UTF-16 units — the length the worker checks
    /// (JS `string.length`) — at the last whitespace before the limit. Counting
    /// Characters instead would let pointed text (niqqud) overshoot and get a 400.
    public static func truncateAtTermBoundary(_ text: String, max: Int = maxLabelLength) -> String {
        guard text.utf16.count > max else { return text }
        var units = 0
        var end = text.startIndex
        for index in text.indices {
            let width = text[index].utf16.count
            if units + width > max { break }
            units += width
            end = text.index(after: index)
        }
        let head = text[..<end]
        guard let space = head.lastIndex(where: \.isWhitespace) else { return String(head) }
        return String(head[..<space])
    }
}
