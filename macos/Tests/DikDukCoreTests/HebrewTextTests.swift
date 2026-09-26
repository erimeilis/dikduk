import Testing
@testable import DikDukCore

@Suite struct HebrewTextTests {
    @Test func detectsHebrew() {
        #expect(HebrewText.containsHebrew("לבקש"))
        #expect(HebrewText.containsHebrew("מְבֻקָּשׁ"))
    }

    @Test func rejectsNonHebrew() {
        #expect(!HebrewText.containsHebrew("hello"))
        #expect(!HebrewText.containsHebrew("123 .,!"))
    }

    @Test func stripsNiqqud() {
        #expect(HebrewText.stripNiqqud("מְבֻקָּשׁ") == "מבקש")
    }

    @Test func stripsZeroWidthMarks() {
        #expect(HebrewText.stripNiqqud("שלום\u{200F}") == "שלום")
    }

    @Test func tokenizes() {
        #expect(HebrewText.tokens("hi שלום, עולם!") == ["שלום", "עולם"])
    }

    @Test func keepsNiqqudInsideToken() {
        #expect(HebrewText.tokens("מְבֻקָּשׁ") == ["מְבֻקָּשׁ"])
    }

    @Test func skipsShortMixedAndAcronymTokens() {
        #expect(HebrewText.shouldSkip("ש"))
        #expect(HebrewText.shouldSkip("שwifi"))
        #expect(HebrewText.shouldSkip("קו5"))
        #expect(HebrewText.shouldSkip("צה״ל"))
        #expect(!HebrewText.shouldSkip("שלום"))
    }

    @Test func termsInOrder() {
        #expect(HebrewText.terms("פתח כרטיסייה חדשה") == ["פתח", "כרטיסייה", "חדשה"])
    }

    @Test func termsDedupeByBareForm() {
        #expect(HebrewText.terms("שָׁלוֹם שלום") == ["שָׁלוֹם"])
    }

    @Test func termsIgnoreLatinAndAcronyms() {
        #expect(HebrewText.terms("Chrome של צה״ל עזרה") == ["של", "עזרה"])
    }

    @Test func termsIgnoreSymbolsAndNewlines() {
        #expect(HebrewText.terms("הגדרות\n⌘,") == ["הגדרות"])
        #expect(HebrewText.terms("שם הקובץ:") == ["שם", "הקובץ"])
    }

    @Test func shortTextIsNotTruncated() {
        #expect(HebrewText.truncateAtTermBoundary("הגדרות") == "הגדרות")
    }

    @Test func truncatesPointedTextByUTF16Length() {
        // Each pointed term is 4 Characters but 11 UTF-16 units — the worker counts UTF-16.
        let pointed = String(repeating: "שָׁלוֹם ", count: 60)
        let cut = HebrewText.truncateAtTermBoundary(pointed)
        #expect(cut.utf16.count <= HebrewText.maxLabelLength)
        #expect(cut.hasSuffix("שָׁלוֹם"))
    }

    @Test func truncatesAtLastBoundaryBeforeLimit() {
        let long = String(repeating: "מילה ", count: 60) // 300 characters
        let cut = HebrewText.truncateAtTermBoundary(long)
        #expect(cut.count <= HebrewText.maxLabelLength)
        #expect(!cut.hasSuffix(" "))
        #expect(cut.hasSuffix("מילה"))
    }
}
