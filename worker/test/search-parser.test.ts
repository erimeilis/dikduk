import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSearchResults } from '../src/search-parser';

const verbHtml = readFileSync('test/fixtures/search-levakesh.html', 'utf-8');
const adjHtml = readFileSync('test/fixtures/search-mevukash.html', 'utf-8');
const qalHtml = readFileSync('test/fixtures/search-leechol.html', 'utf-8');

describe('parseSearchResults', () => {
  it('parses a verb search result', () => {
    const r = parseSearchResults(verbHtml);
    expect(r).not.toBeNull();
    // Strip niqqud (all Hebrew nonspacing marks, \p{Mn}), then assert exact consonants.
    expect(r!.lemma.replace(/\p{Mn}/gu, '')).toBe('לבקש');
    expect(r!.lemma).not.toContain('\u{1F50A}'); // no 🔊 audio icon
    expect(r!.root).toBe('ב־ק־שׁ');
    expect(r!.translation.toLowerCase()).toMatch(/ask|request/);
    expect(r!.isVerb).toBe(true);
    expect(r!.dictUrl).toBe('https://www.pealim.com/dict/255-levakesh/');
    expect(r!.binyan).toBe("Pi'el");
  });

  it('parses a non-verb (adjective) search result as isVerb=false', () => {
    const r = parseSearchResults(adjHtml);
    expect(r).not.toBeNull();
    expect(r!.isVerb).toBe(false);
    expect(r!.lemma.replace(/\p{Mn}/gu, '')).toBe('מבוקש');
    expect(r!.lemma).not.toContain('\u{1F50A}'); // no 🔊 audio icon
    expect(r!.translation.toLowerCase()).toMatch(/want|request|desire|require/);
    expect(r!.dictUrl).toContain('/dict/9321-mevukash/');
  });

  it('returns null when there is no result block', () => {
    expect(parseSearchResults('<html><body>nothing</body></html>')).toBeNull();
  });

  it('parses a Qal verb and reads its binyan from the search page', () => {
    const r = parseSearchResults(qalHtml);
    expect(r).not.toBeNull();
    expect(r!.isVerb).toBe(true);
    expect(r!.binyan).toBe("Pa'al");
    expect(r!.root).toBe('א־כ־ל');
  });
});
