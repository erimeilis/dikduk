// Hebrew text normalization primitives, shared across features.

// Strip Hebrew niqqud (vowel points) and cantillation marks (U+0591–U+05C7).
export function stripHebrewMarks(text: string): string {
  return text.replace(/[֑-ׇ]/g, '');
}

// Canonical comparison form: NFKC-normalize then drop niqqud/cantillation marks.
export function normalizeHebrew(text: string): string {
  return stripHebrewMarks(text.normalize('NFKC'));
}
