import { describe, it, expect } from 'vitest';
import { stripDiacritics, tokenizeHebrew, shouldSkip } from '../src/shared/hebrew';

describe('stripDiacritics', () => {
  it('removes niqqud and cantillation, keeps letters', () => {
    expect(stripDiacritics('מְבֻקָּשׁ')).toBe('מבקש');
  });
  it('removes zero-width / bidi marks', () => {
    expect(stripDiacritics('שלום‏')).toBe('שלום');
  });
});

describe('tokenizeHebrew', () => {
  it('returns Hebrew tokens with correct offsets', () => {
    const toks = tokenizeHebrew('hi שלום, עולם!');
    expect(toks.map((t) => t.text)).toEqual(['שלום', 'עולם']);
    expect(toks[0]).toMatchObject({ text: 'שלום', start: 3, end: 7 });
  });
  it('keeps niqqud inside a token whole', () => {
    expect(tokenizeHebrew('מְבֻקָּשׁ')[0].text).toBe('מְבֻקָּשׁ');
  });
});

describe('shouldSkip', () => {
  it('skips tokens shorter than 2 letters', () => {
    expect(shouldSkip('ש')).toBe(true);
  });
  it('skips mixed Latin/digit tokens', () => {
    expect(shouldSkip('שwifi')).toBe(true);
    expect(shouldSkip('קו5')).toBe(true);
  });
  it('skips acronyms with gershayim/geresh', () => {
    expect(shouldSkip('צה״ל')).toBe(true);
    expect(shouldSkip('ד״ר')).toBe(true);
  });
  it('does not skip an ordinary word', () => {
    expect(shouldSkip('שלום')).toBe(false);
  });
});
