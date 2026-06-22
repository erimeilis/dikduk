const HEBREW_LETTER = /[א-ת]/; // Hebrew letters (excludes niqqud/punct alone)

export function containsHebrew(text: string): boolean {
  return HEBREW_LETTER.test(text);
}

export function extractWord(selection: string): string {
  return selection.trim().split(/\s+/)[0] ?? '';
}

export function extractHebrewWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[^א-ת]+|[^א-ת֑-ׇ]+$/gu, '');
    if (!token || !containsHebrew(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}
