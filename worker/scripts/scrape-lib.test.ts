import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildResult, collectAliases, sqlEscape, entryToSql, slugFromLocation } from './scrape-lib';
import type { LookupResult } from '../src/lookup/types';

const html = readFileSync('test/fixtures/dict-leechol.html', 'utf-8');

describe('slugFromLocation', () => {
  it('extracts slug from a dict redirect location', () => {
    expect(slugFromLocation('https://www.pealim.com/dict/1-lichtov/')).toBe('lichtov');
    expect(slugFromLocation('/dict/5000-chanak/')).toBe('chanak');
    expect(slugFromLocation('/search/?q=x')).toBeNull();
  });
});

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

describe('sqlEscape', () => {
  it('doubles single quotes for SQLite escaping', () => {
    expect(sqlEscape("it's")).toBe("it''s");
    expect(sqlEscape("a'b'c")).toBe("a''b''c");
  });

  it('passes Hebrew/UTF-8 through unchanged when no quotes present', () => {
    expect(sqlEscape('לאכול')).toBe('לאכול');
  });
});

describe('entryToSql', () => {
  const result: LookupResult = {
    word: 'leechol',
    lemma: "לאכול",
    slug: 'leechol',
    translation: "to eat's",
    root: 'א-כ-ל',
    isVerb: true,
    inflectionKind: 'verb',
    voices: {
      active: {
        binyan: 'PAAL',
        forms: {
          present: { ms: 'אוכל', fs: 'אוכלת', mp: 'אוכלים', fp: 'אוכלות' },
          past: {
            '1s': 'אכלתי', '1p': 'אכלנו',
            '2ms': 'אכלת', '2fs': 'אכלת', '2mp': 'אכלתם', '2fp': 'אכלתן',
            '3ms': 'אכל', '3fs': 'אכלה', '3p': 'אכלו',
          },
          future: {
            '1s': 'אוכל', '1p': 'נאכל',
            '2ms': 'תאכל', '2fs': 'תאכלי', '2mp': 'תאכלו', '2fp': 'תאכלו',
            '3ms': 'יאכל', '3fs': 'תאכל', '3mp': 'יאכלו', '3fp': 'תאכלו',
          },
          imperative: { '2ms': 'אכול', '2fs': 'אכלי', '2mp': 'אכלו', '2fp': 'אכלו' },
          infinitive: 'לאכול',
        },
      },
    },
    seeAlso: [{ label: "related's", slug: 'lishtot' }],
    sourceUrl: 'https://www.pealim.com/dict/1-leechol/',
  };
  const aliases = ["לאכול", "it's"];
  const nowMs = 1735689600000;

  it('produces an entries upsert with the slug', () => {
    const sql = entryToSql(result, aliases, nowMs);
    expect(sql).toContain('INSERT INTO entries');
    expect(sql).toContain("ON CONFLICT(slug) DO UPDATE SET");
    expect(sql).toContain("'leechol'");
  });

  it('produces an aliases insert per alias using the slug subquery', () => {
    const sql = entryToSql(result, aliases, nowMs);
    expect(sql).toContain('INSERT OR IGNORE INTO aliases');
    expect(sql).toContain("(SELECT id FROM entries WHERE slug='leechol')");
    expect(sql).toContain("'לאכול'");
    expect(sql).toContain("'it''s'"); // escaped alias
  });

  it('produces a see_also insert resolved via slug subqueries', () => {
    const sql = entryToSql(result, aliases, nowMs);
    expect(sql).toContain('INSERT OR IGNORE INTO see_also');
    expect(sql).toContain("(SELECT id FROM entries WHERE slug='leechol')");
    expect(sql).toContain("'lishtot'");
    expect(sql).toContain("(SELECT id FROM entries WHERE slug='lishtot')");
    expect(sql).toContain("'related''s'"); // escaped label
  });

  it('escapes single quotes inside translation/data values', () => {
    const sql = entryToSql(result, aliases, nowMs);
    expect(sql).toContain("to eat''s");
  });

  it('includes binyan from the active voice', () => {
    const sql = entryToSql(result, aliases, nowMs);
    expect(sql).toContain("'PAAL'");
  });

  it('uses NULL for binyan when there is no active voice', () => {
    const noVoice: LookupResult = { ...result, voices: undefined };
    const sql = entryToSql(noVoice, aliases, nowMs);
    // entries statement (first) should have NULL where binyan column value goes
    const entriesStatement = sql.split(';')[0];
    expect(entriesStatement).toMatch(/,\s*NULL\s*,/);
  });
});
