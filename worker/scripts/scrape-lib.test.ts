import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildResult, collectAliases } from './scrape-lib';

const html = readFileSync('test/fixtures/dict-leechol.html', 'utf-8');

describe('buildResult', () => {
  it('builds a LookupResult and aliases every inflected form', () => {
    const r = buildResult(html, 'leechol', 1);
    expect(r.isVerb).toBe(true);
    expect(r.slug).toBe('leechol');
    expect(r.sourceUrl).toBe('https://www.pealim.com/dict/1-leechol/');
    const aliases = collectAliases(r);
    expect(aliases).toContain(r.word);
    expect(aliases.length).toBeGreaterThan(5); // conjugation forms present
    expect(new Set(aliases).size).toBe(aliases.length); // deduped
  });
});
