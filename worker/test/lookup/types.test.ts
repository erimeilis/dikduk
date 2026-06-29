import { describe, it, expect } from 'vitest';
import type { LookupResult } from '../../src/lookup/types';

describe('types', () => {
  it('composes a v2 verb result with voices and seeAlso', () => {
    const r: LookupResult = {
      word: 'x', lemma: 'x', slug: '1-x', translation: 't', root: 'r',
      isVerb: true,
      voices: { active: { binyan: "Pi'el", forms: {} as any } },
      seeAlso: [{ label: 'y', slug: '2-y' }],
      sourceUrl: 'https://example.com',
    };
    expect(r.voices?.active?.binyan).toBe("Pi'el");
    expect(r.seeAlso[0].slug).toBe('2-y');
  });
});
