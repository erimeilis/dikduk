import { describe, it, expect } from 'vitest';
import { extractHebrewWords } from '../src/shared/hebrew';

describe('extractHebrewWords', () => {
  it('returns Hebrew tokens, dropping Latin/punctuation-only tokens', () => {
    expect(extractHebrewWords('שלום world לבקש, 123')).toEqual(['שלום', 'לבקש']);
  });
  it('dedupes while preserving first-seen order', () => {
    expect(extractHebrewWords('לבקש לבקש שלום')).toEqual(['לבקש', 'שלום']);
  });
  it('strips surrounding punctuation but keeps niqqud-bearing words', () => {
    expect(extractHebrewWords('«מְבֻקָּשׁ».')).toEqual(['מְבֻקָּשׁ']);
  });
  it('returns [] when there is no Hebrew', () => {
    expect(extractHebrewWords('hello 42 !!!')).toEqual([]);
  });
});
