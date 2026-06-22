import { describe, it, expect } from 'vitest';
import type { LookupResult } from '../src/types';

describe('types', () => {
  it('LookupResult composes a minimal non-verb result', () => {
    const r: LookupResult = {
      word: 'x', lemma: 'x', translation: 't', root: 'r',
      isVerb: false, sourceUrl: 'https://example.com',
    };
    expect(r.isVerb).toBe(false);
  });
});
