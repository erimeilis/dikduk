import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSearchResults } from '../src/search-parser';

const verbHtml = readFileSync(new URL('./fixtures/search-levakesh.html', import.meta.url), 'utf-8');
const adjHtml = readFileSync(new URL('./fixtures/search-mevukash.html', import.meta.url), 'utf-8');

describe('parseSearchResults', () => {
  it('parses a verb search result', () => {
    const r = parseSearchResults(verbHtml);
    expect(r).not.toBeNull();
    // Strip niqqud (all Hebrew nonspacing marks, \p{Mn}), then match the bare
    // consonants — niqqud marks sit BETWEEN letters, so /בקש/ never matches the
    // vocalized form directly.
    expect(r!.lemma.replace(/\p{Mn}/gu, '')).toMatch(/בקש/);
    expect(r!.root).toBe('ב־ק־שׁ');
    expect(r!.translation.toLowerCase()).toMatch(/ask|request/);
    expect(r!.isVerb).toBe(true);
    expect(r!.dictUrl).toBe('https://www.pealim.com/dict/255-levakesh/');
  });

  it('parses a non-verb (adjective) search result as isVerb=false', () => {
    const r = parseSearchResults(adjHtml);
    expect(r).not.toBeNull();
    expect(r!.isVerb).toBe(false);
    expect(r!.translation.toLowerCase()).toMatch(/want|request|desire|require/);
    expect(r!.dictUrl).toContain('/dict/9321-mevukash/');
  });

  it('returns null when there is no result block', () => {
    expect(parseSearchResults('<html><body>nothing</body></html>')).toBeNull();
  });
});
