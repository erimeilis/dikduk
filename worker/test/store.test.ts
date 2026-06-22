import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createD1Store } from '../src/store';
import type { LookupResult } from '../src/types';

// Minimal adapter exposing the subset of the D1 API that store.ts uses.
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

function makeResult(over: Partial<LookupResult> = {}): LookupResult {
  return {
    word: 'לבקש', lemma: 'לְבַקֵּשׁ', slug: '255-levakesh',
    translation: 'to ask', root: 'ב־ק־שׁ', isVerb: true,
    voices: { active: { binyan: "Pi'el", forms: {} as any } },
    seeAlso: [{ label: 'בַּקָּשָׁה', slug: '3000-bakasha' }],
    sourceUrl: 'https://www.pealim.com/dict/255-levakesh/',
    ...over,
  };
}

describe('createD1Store', () => {
  let db: Database.Database;
  let store: ReturnType<typeof createD1Store>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(schema);
    store = createD1Store(d1(db));
  });

  it('returns null for an unknown query', async () => {
    expect(await store.get('nope')).toBeNull();
  });

  it('round-trips a result by query', async () => {
    await store.put('לבקש', makeResult());
    const r = await store.get('לבקש');
    expect(r?.slug).toBe('255-levakesh');
    expect(r?.voices?.active?.binyan).toBe("Pi'el");
  });

  it('maps a second inflected query to the same entry without duplicating it', async () => {
    await store.put('לבקש', makeResult());
    await store.put('מבקשים', makeResult({ word: 'מבקשים' }));
    expect(await store.get('מבקשים')).not.toBeNull();
    expect(db.prepare('SELECT COUNT(*) c FROM entries').get() as any).toEqual({ c: 1 });
    expect((db.prepare('SELECT COUNT(*) c FROM aliases').get() as any).c).toBe(2);
  });

  it('stores see_also rows and backfills to_id when the target is later stored', async () => {
    await store.put('לבקש', makeResult());                 // references 3000-bakasha (not yet stored)
    let row = db.prepare("SELECT to_id FROM see_also WHERE to_slug='3000-bakasha'").get() as any;
    expect(row.to_id).toBeNull();
    await store.put('בקשה', makeResult({ slug: '3000-bakasha', word: 'בקשה', seeAlso: [] }));
    row = db.prepare("SELECT to_id FROM see_also WHERE to_slug='3000-bakasha'").get() as any;
    expect(row.to_id).not.toBeNull();
  });
});
