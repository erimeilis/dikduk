import { describe, it, expect } from 'vitest';
import { isLookupError } from '../src/contracts/lookup';
import type { LookupResult } from '../src/contracts/lookup';

describe('v2 types', () => {
  it('composes a verb result with voices + seeAlso', () => {
    const r: LookupResult = {
      word: 'x', lemma: 'x', slug: '1-x', translation: 't', root: 'r', isVerb: true,
      voices: { active: { binyan: "Pi'el", forms: {} as any }, passive: { binyan: "Pu'al", forms: {} as any } },
      seeAlso: [{ label: 'y', slug: '2-y' }],
      sourceUrl: 'https://www.pealim.com/dict/1-x/',
    };
    expect(r.voices?.passive?.binyan).toBe("Pu'al");
    expect(isLookupError(r)).toBe(false);
  });
  it('detects errors', () => {
    expect(isLookupError({ error: 'e', code: 'NO_RESULTS' })).toBe(true);
  });
});
