import { describe, it, expect } from 'vitest';
import { normalizeQuery } from '../../src/lookup/normalize';

describe('normalizeQuery', () => {
  it('strips surrounding punctuation', () => {
    expect(normalizeQuery('  «לבקש».  ')).toBe('לבקש');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeQuery('לבקש   דבר')).toBe('לבקש דבר');
  });

  it('leaves already-unvowelled input unchanged', () => {
    expect(normalizeQuery('לאכול')).toBe('לאכול');
  });

  it('strips niqqud so a vowelled Pealim form matches its unvowelled query key', () => {
    // "לֶאֱכוֹל" (leechol, fully vowelled) must normalize to the same key as "לאכול".
    const vowelled = 'לֶאֱכוֹל';
    const bare = 'לאכול';
    expect(normalizeQuery(vowelled)).toBe(bare);
    expect(normalizeQuery(vowelled)).toBe(normalizeQuery(bare));
  });

  it('strips cantillation marks in addition to niqqud', () => {
    // U+0591 (etnahta) is a cantillation mark, distinct from niqqud vowel points.
    expect(normalizeQuery('לבקש֑')).toBe('לבקש');
  });
});
