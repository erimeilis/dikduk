import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { buildResult, collectAliases, entryToSql } from './scrape-lib';
import { normalizeQuery } from '../src/lookup/normalize';
import { createD1Store } from '../src/storage/d1-store';

// Minimal adapter exposing the subset of the D1 API that d1-store.ts uses, mirroring
// test/storage/store.test.ts's approach of running better-sqlite3 against the real schema.
function d1(db: Database.Database): any {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      const mk = (args: unknown[]) => ({
        first: async () => stmt.get(...args) ?? null,
        run: async () => { stmt.run(...args); return {}; },
        all: async () => ({ results: stmt.all(...args) }),
      });
      return { bind: (...args: unknown[]) => mk(args), ...mk([]) };
    },
  };
}

const schema = readFileSync('migrations/0001_init.sql', 'utf-8');
const html = readFileSync('test/fixtures/dict-leechol.html', 'utf-8');

describe('scraper write -> D1 store read round-trip', () => {
  it('an unvowelled query finds the entry the scraper wrote from vowelled Pealim forms', async () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(schema);

    const result = buildResult(html, 'leechol', 30);
    const aliases = collectAliases(result);
    const sql = entryToSql(result, aliases, Date.now());
    // Multi-statement SQL: better-sqlite3's .exec runs the whole batch at once, matching how
    // scrape-pealim.ts flushes a batch of entryToSql output via `wrangler d1 execute --file`.
    db.exec(sql);

    const store = createD1Store(d1(db));

    // The real-world failure mode this proves fixed: aliases are collected from Pealim's
    // fully-vowelled `.menukad` forms (e.g. "לֶאֱכוֹל"), but a live page query arrives
    // unvowelled (e.g. "לאכול"). Both must normalize to the same query_key.
    const unvowelledQuery = normalizeQuery('לאכול');
    const found = await store.get(unvowelledQuery);

    expect(found).not.toBeNull();
    expect(found?.lemma).toBeTruthy();
    expect(found?.lemma).toBe(result.lemma);
    // slug must be the full `id-slug` form (matching the live search-parser path), not the
    // bare slug — the extension's Pealim link and see_also resolution depend on this.
    expect(found?.slug).toBe('30-leechol');
  });
});
