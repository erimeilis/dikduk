// Hebrew text primitives shared across the extension: detection, word extraction,
// tokenization, and diacritic stripping. Consolidates the former `hebrew.ts`
// (containsHebrew/extractWord/extractHebrewWords) with the former
// `spellcheck/normalize.ts` (tokenizeHebrew/stripDiacritics/shouldSkip).

const HEBREW_LETTER = /[א-ת]/; // Hebrew letters (excludes niqqud/punct alone)

// Strip all Hebrew combining marks — niqqud + cantillation (U+0591–U+05C7).
// That range also contains the spacing-punctuation MAQAF (U+05BE), PASEQ
// (U+05C0), SOF PASUQ (U+05C3) and NUN HAFUKHA (U+05C6); these are stripped
// too, which is acceptable here — the dictionary stage works on bare letters.
const COMBINING = /[֑-ׇֽֿׁׂׅׄ]/g;
const ZERO_WIDTH = /[​-‏‪-‮⁠﻿]/g;
// A token: a Hebrew letter followed by more letters / marks / in-word symbols.
const TOKEN = /[א-ת][א-ת֑-ׇ׳״'"]*/gu;

export interface Token {
  text: string;
  start: number;
  end: number;
}

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

export function stripDiacritics(s: string): string {
  return s.replace(COMBINING, '').replace(ZERO_WIDTH, '');
}

export function tokenizeHebrew(source: string): Token[] {
  const out: Token[] = [];
  for (const m of source.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    out.push({ text: m[0], start, end: start + m[0].length });
  }
  return out;
}

export function shouldSkip(token: string): boolean {
  if (/[A-Za-z0-9]/.test(token)) return true; // mixed Latin/digits
  if (/[׳״'"]/.test(token)) return true; // acronym / abbreviation
  const letters = stripDiacritics(token).replace(/[^א-ת]/g, '');
  return letters.length < 2; // too short to judge
}
