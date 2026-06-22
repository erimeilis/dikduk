const HEBREW_LETTER = /[א-ת]/; // Hebrew letters (excludes niqqud/punct alone)

export function containsHebrew(text: string): boolean {
  return HEBREW_LETTER.test(text);
}

export function extractWord(selection: string): string {
  return selection.trim().split(/\s+/)[0] ?? '';
}
