import { describe, it, expect } from 'vitest';
import { computeCandidates } from '../src/spellcheck/controller';

describe('computeCandidates', () => {
  it('returns tokens to check + unique normalized forms, applying skip + user dict + ignore', () => {
    const text = 'שלום שלוום שלוום צה״ל אני';
    const { tokens, norms } = computeCandidates(text, new Set(['שלום']), new Set(['אני']));
    // 'שלום' is in userdict, 'צה״ל' is an acronym (skipped), 'אני' is ignored.
    // Remaining candidates: the two 'שלוום' occurrences.
    expect(tokens.map((t) => t.text)).toEqual(['שלוום', 'שלוום']);
    // normalized forms are deduped for the worker
    expect(norms).toEqual(['שלוום']);
  });
});
