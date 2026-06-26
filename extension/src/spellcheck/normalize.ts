// Hebrew combining marks (niqqud + cantillation; all Unicode Mn), excluding
// the spacing punctuation at U+05BE/05C0/05C3/05C6 which tokenization handles.
const COMBINING = /[֑-ׇֽֿׁׂׅׄ]/g;
const ZERO_WIDTH = /[​-‏‪-‮⁠﻿]/g;
// A token: a Hebrew letter followed by more letters / marks / in-word symbols.
const TOKEN = /[א-ת][א-ת֑-ׇ׳״'"]*/gu;

export interface Token {
  text: string;
  start: number;
  end: number;
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
