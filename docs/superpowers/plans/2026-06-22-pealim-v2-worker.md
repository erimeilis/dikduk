# Pealim v2 — Worker Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Evolve the Worker from a KV-only cache to a tiered **KV → D1 → Pealim** data layer that also captures **passive forms** and **"See also" references**, serving a new v2 JSON contract.

**Architecture:** Keep KV as the fast TTL'd tier-1; add a D1 database as the permanent tier-2 mirror with a relational schema (`entries`/`aliases`/`see_also`). On a miss, fetch+parse Pealim (search + dict page for every entry now, to capture see-also), assemble the v2 `LookupResult`, and write through to both D1 (permanent) and KV (TTL). The extension is **not** touched in this plan (Plan 2).

**Tech Stack:** TypeScript, Cloudflare Workers + D1, `node-html-parser`, Vitest. Store unit tests run against real SQLite via `better-sqlite3` (D1 is SQLite, same dialect).

## Global Constraints

- TypeScript strict; parsing via `node-html-parser` (already a dep). Install latest dep versions; don't pin from memory.
- **v2 contract** (replaces v1's flat `conjugation`/`binyan`): `LookupResult` has `slug`, `voices?: { active?: Voice; passive?: Voice }`, and `seeAlso: SeeAlsoRef[]`. `Voice = { binyan: string | null; forms: Conjugation }`. `Conjugation` keys unchanged (present {ms,fs,mp,fp}; past {1s,1p,2ms,2fs,2mp,2fp,3ms,3fs,**3p**}; future {1s,1p,2ms,2fs,2mp,2fp,3ms,3fs,**3mp,3fp**}; imperative {2ms,2fs,2mp,2fp}; infinitive string).
- Active forms = bare cell IDs; **passive forms = `passive-`-prefixed IDs** (`passive-AP-ms`, etc.); Pu'al passive has no imperative/infinitive (those cells absent → empty strings).
- See-also: only `/dict/<digits>-slug/` entry links inside `table.dict-table-t`, each with a `.menukad` label; skip `/dict/?…` and footer links.
- Tiered lookup order **KV → D1 → Pealim**; write-through to **both** D1 (permanent, no TTL) and KV (`expirationTtl` 2592000). Every entry now fetches the dict page (for see-also), verbs and non-verbs alike.
- No Silent Failures: KV read error → fall to D1; D1 read error → fall to Pealim; KV/D1 write errors → log + still return; parser throw or degenerate active conjugation for a verb → `PARSE`; Pealim non-2xx/throw → `UPSTREAM`; no results → `NO_RESULTS`.
- D1 binding name `DB`; KV binding stays `PEALIM_CACHE`. Migrations via `wrangler d1 migrations`.
- Git: feature branch `feature/pealim-v2-worker`; `git add .`; compact messages, **no AI attribution**. Never deploy without explicit user approval.

---

## File Structure

```
worker/
├── migrations/0001_init.sql        # NEW — entries/aliases/see_also schema
├── wrangler.toml                   # MODIFY — add [[d1_databases]] DB
├── package.json                    # MODIFY — db migration scripts + better-sqlite3 devdep
├── src/
│   ├── types.ts                    # MODIFY — v2 contract (Voice, slug, voices, seeAlso)
│   ├── search-parser.ts            # MODIFY — add slug
│   ├── dict-parser.ts              # MODIFY — active+passive voices + see-also
│   ├── store.ts                    # NEW — D1-backed Store (get/put + upsert/alias/see_also)
│   ├── lookup.ts                   # MODIFY — tiered KV→Store→Pealim, assemble v2
│   └── index.ts                    # MODIFY — Env.DB binding, wire store
└── test/
    ├── search-parser.test.ts       # MODIFY — slug
    ├── dict-parser.test.ts         # MODIFY — voices + see-also
    ├── store.test.ts               # NEW — better-sqlite3-backed
    ├── lookup.test.ts              # MODIFY — v2 tiers + write-through
    └── index.test.ts               # MODIFY — v2 contract + DB binding
```

---

## Task 1: D1 setup — schema migration, binding, scripts

**Files:** Create `worker/migrations/0001_init.sql`; Modify `worker/wrangler.toml`, `worker/package.json`.

**Interfaces:** Produces the D1 schema (`entries`, `aliases`, `see_also`) and the `DB` binding that Tasks 5/7 use.

- [ ] **Step 1: Verify you are on the feature branch**
```bash
cd /Volumes/Annette/IdeaProjects/pealim
git branch --show-current   # must print: feature/pealim-v2-worker
```
The branch `feature/pealim-v2-worker` already exists and is checked out (branched from the v1 work). Do NOT create a new branch; do NOT switch to `main` or the v1 branch.

- [ ] **Step 2: Write `worker/migrations/0001_init.sql`**
```sql
CREATE TABLE entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  lemma       TEXT NOT NULL,
  root        TEXT,
  translation TEXT NOT NULL,
  is_verb     INTEGER NOT NULL,
  binyan      TEXT,
  data        TEXT NOT NULL,
  source_url  TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);
CREATE TABLE aliases (
  query_key  TEXT PRIMARY KEY,
  entry_id   INTEGER NOT NULL REFERENCES entries(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE see_also (
  from_id  INTEGER NOT NULL REFERENCES entries(id),
  to_slug  TEXT NOT NULL,
  to_id    INTEGER REFERENCES entries(id),
  label    TEXT NOT NULL,
  PRIMARY KEY (from_id, to_slug)
);
CREATE INDEX idx_entries_lemma ON entries(lemma);
CREATE INDEX idx_entries_root  ON entries(root);
CREATE INDEX idx_see_also_to_slug ON see_also(to_slug);
```

- [ ] **Step 3: Add the D1 binding to `worker/wrangler.toml`** (append; keep existing KV binding)
```toml
[[d1_databases]]
binding = "DB"
database_name = "pealim"
database_id = "PLACEHOLDER_FILL_AT_DEPLOY"
migrations_dir = "migrations"
```

- [ ] **Step 4: Add migration scripts to `worker/package.json`** (merge into `"scripts"`)
```json
"db:migrate:local": "wrangler d1 migrations apply pealim --local",
"db:migrate:prod": "wrangler d1 migrations apply pealim --remote"
```

- [ ] **Step 5: Apply migrations locally to verify the SQL is valid**
Run: `cd worker && npx wrangler d1 migrations apply pealim --local`
Expected: reports "1 migration(s) applied" (creates a local SQLite under `.wrangler/`). If it prompts to create the local DB, accept. No remote/account calls (`--local`).

- [ ] **Step 6: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add .
git commit -m "Add D1 schema migration and DB binding for v2 data layer"
```

---

## Task 2: v2 types

**Files:** Modify `worker/src/types.ts`; Test `worker/test/types.test.ts`.

**Interfaces:** Produces `Conjugation`, `Voice`, `SeeAlsoRef`, `LookupResult` (v2), `LookupError`, `SearchResult` (with `slug`). Consumed by every later task.

- [ ] **Step 1: Replace `worker/src/types.ts` with the v2 contract**
```ts
export interface Conjugation {
  present: { ms: string; fs: string; mp: string; fp: string };
  past: {
    '1s': string; '1p': string;
    '2ms': string; '2fs': string; '2mp': string; '2fp': string;
    '3ms': string; '3fs': string; '3p': string;
  };
  future: {
    '1s': string; '1p': string;
    '2ms': string; '2fs': string; '2mp': string; '2fp': string;
    '3ms': string; '3fs': string; '3mp': string; '3fp': string;
  };
  imperative: { '2ms': string; '2fs': string; '2mp': string; '2fp': string };
  infinitive: string;
}

export interface Voice {
  binyan: string | null;
  forms: Conjugation;
}

export interface SeeAlsoRef {
  label: string;
  slug: string;
}

export interface LookupResult {
  word: string;
  lemma: string;
  slug: string;
  translation: string;
  root: string;
  isVerb: boolean;
  voices?: { active?: Voice; passive?: Voice };
  seeAlso: SeeAlsoRef[];
  sourceUrl: string;
}

export type ErrorCode = 'NO_RESULTS' | 'UPSTREAM' | 'PARSE';

export interface LookupError {
  error: string;
  code: ErrorCode;
}

export interface SearchResult {
  lemma: string;
  slug: string;
  root: string;
  translation: string;
  isVerb: boolean;
  binyan?: string;
  dictUrl: string;
}
```

- [ ] **Step 2: Replace `worker/test/types.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import type { LookupResult } from '../src/types';

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
```

- [ ] **Step 3: Run typecheck + test** — `cd worker && npm run typecheck && npm test -- types`
Expected: tsc clean; 1 test passes. (Other test files will fail to typecheck/run until their tasks update them — that is expected mid-plan; run the focused test here.)

- [ ] **Step 4: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Update worker types to v2 contract (voices, slug, seeAlso)"
```

---

## Task 3: search-parser — add `slug`

**Files:** Modify `worker/src/search-parser.ts`, `worker/test/search-parser.test.ts`.

**Interfaces:** Consumes `SearchResult`. Produces `parseSearchResults(html) → SearchResult | null` now including `slug` (from `dictUrl` `/dict/<slug>/`).

- [ ] **Step 1: Add the slug assertions to the existing tests** in `worker/test/search-parser.test.ts` — add to the verb test:
```ts
    expect(r!.slug).toBe('255-levakesh');
```
and to the adjective test:
```ts
    expect(r!.slug).toBe('9321-mevukash');
```

- [ ] **Step 2: Run to confirm failure** — `cd worker && npm test -- search-parser`
Expected: FAIL (`slug` is undefined / property missing).

- [ ] **Step 3: Implement** — in `worker/src/search-parser.ts`, after computing `dictUrl`, derive `slug` and include it. Replace the final `return { … }` with:
```ts
  const dictUrl = href.startsWith('http') ? href : BASE + href;
  const slugMatch = dictUrl.match(/\/dict\/([^/?#]+)\//);
  const slug = slugMatch ? slugMatch[1] : '';

  return { lemma, slug, root: root_, translation, isVerb, binyan, dictUrl };
```
(Keep the existing `binyan` extraction from v1. `lemma`, `root_`, `translation`, `isVerb` are computed as before.)

- [ ] **Step 4: Run tests + typecheck** — `cd worker && npm test -- search-parser && npm run typecheck`
Expected: search-parser tests PASS; tsc clean for src + this test.

- [ ] **Step 5: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Add slug to search-parser result"
```

---

## Task 4: dict-parser — active + passive voices + see-also

**Files:** Modify `worker/src/dict-parser.ts`, `worker/test/dict-parser.test.ts`.

**Interfaces:** Consumes `Conjugation`, `Voice`, `SeeAlsoRef`. Produces:
`parseDictPage(html) → { voices?: { active?: Voice; passive?: Voice }; seeAlso: SeeAlsoRef[] }`.

- [ ] **Step 1: Replace `worker/test/dict-parser.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDictPage } from '../src/dict-parser';

const html = readFileSync('test/fixtures/dict-levakesh.html', 'utf-8');
const bare = (s: string) => s.replace(/\p{Mn}/gu, '');

describe('parseDictPage', () => {
  const { voices, seeAlso } = parseDictPage(html);

  it('reads active voice (Pi\'el) with present + infinitive', () => {
    expect(voices?.active?.binyan).toBe("Pi'el");
    expect(bare(voices!.active!.forms.present.ms)).toMatch(/מבקש/);
    expect(bare(voices!.active!.forms.infinitive)).toMatch(/לבקש/);
  });

  it('reads passive voice (Pu\'al) with present/past/future, empty imperative/infinitive', () => {
    expect(voices?.passive?.binyan).toBe("Pu'al");
    expect(bare(voices!.passive!.forms.present.ms)).toMatch(/מבוקש/);
    expect(voices!.passive!.forms.imperative['2ms']).toBe('');
    expect(voices!.passive!.forms.infinitive).toBe('');
  });

  it('extracts see-also entry references (entry links only)', () => {
    const slugs = seeAlso.map((s) => s.slug);
    expect(slugs).toContain('2955-bikush');
    expect(slugs).toContain('256-lehitbakesh');
    expect(slugs).toContain('3000-bakasha');
    expect(slugs).toContain('9321-mevukash');
    // no root-search / pattern / footer links
    expect(seeAlso.every((s) => /^\d+-[^/?#]+$/.test(s.slug))).toBe(true);
    expect(seeAlso.find((s) => s.slug === '2955-bikush')!.label.replace(/\p{Mn}/gu, '')).toMatch(/ביקוש/);
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `cd worker && npm test -- dict-parser`
Expected: FAIL (`parseDictPage` returns old shape; `voices`/`seeAlso` undefined).

- [ ] **Step 3: Replace `worker/src/dict-parser.ts`**
```ts
import { parse, type HTMLElement } from 'node-html-parser';
import type { Conjugation, Voice, SeeAlsoRef } from './types';

const PRESENT_IDS = { ms: 'AP-ms', fs: 'AP-fs', mp: 'AP-mp', fp: 'AP-fp' } as const;
const PAST_IDS = {
  '1s': 'PERF-1s', '1p': 'PERF-1p',
  '2ms': 'PERF-2ms', '2fs': 'PERF-2fs', '2mp': 'PERF-2mp', '2fp': 'PERF-2fp',
  '3ms': 'PERF-3ms', '3fs': 'PERF-3fs', '3p': 'PERF-3p',
} as const;
const FUTURE_IDS = {
  '1s': 'IMPF-1s', '1p': 'IMPF-1p',
  '2ms': 'IMPF-2ms', '2fs': 'IMPF-2fs', '2mp': 'IMPF-2mp', '2fp': 'IMPF-2fp',
  '3ms': 'IMPF-3ms', '3fs': 'IMPF-3fs', '3mp': 'IMPF-3mp', '3fp': 'IMPF-3fp',
} as const;
const IMP_IDS = { '2ms': 'IMP-2ms', '2fs': 'IMP-2fs', '2mp': 'IMP-2mp', '2fp': 'IMP-2fp' } as const;

function formById(root: HTMLElement, id: string): string {
  const cell = root.getElementById(id);
  if (!cell) return '';
  const menukad = cell.querySelector('.menukad');
  const raw = menukad?.text ?? cell.text;
  return raw
    .split('~')[0]
    .replace(/[​-‏‪-‮]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapForms<K extends string>(root: HTMLElement, ids: Record<K, string>, prefix: string): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(ids) as K[]) out[key] = formById(root, prefix + ids[key]);
  return out;
}

function readVoice(root: HTMLElement, prefix: string): Conjugation {
  return {
    present: {
      ms: formById(root, prefix + PRESENT_IDS.ms),
      fs: formById(root, prefix + PRESENT_IDS.fs),
      mp: formById(root, prefix + PRESENT_IDS.mp),
      fp: formById(root, prefix + PRESENT_IDS.fp),
    },
    past: mapForms(root, PAST_IDS, prefix),
    future: mapForms(root, FUTURE_IDS, prefix),
    imperative: mapForms(root, IMP_IDS, prefix),
    infinitive: formById(root, prefix + 'INF-L'),
  };
}

function hasForms(c: Conjugation): boolean {
  return (
    !!c.present.ms || !!c.infinitive ||
    Object.values(c.past).some(Boolean) || Object.values(c.future).some(Boolean)
  );
}

function binyanFor(root: HTMLElement, headerStart: string): string | null {
  for (const h of root.querySelectorAll('h3.page-header')) {
    if (h.text.trim().startsWith(headerStart)) {
      return (h.querySelector('.small')?.text ?? '').replace(/^Binyan\s+/i, '').trim() || null;
    }
  }
  return null;
}

function parseSeeAlso(root: HTMLElement): SeeAlsoRef[] {
  const out: SeeAlsoRef[] = [];
  const tbl = root.querySelector('table.dict-table-t');
  if (!tbl) return out;
  for (const a of tbl.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? '';
    const m = href.match(/^\/dict\/(\d+-[^/?#]+)\/$/);
    if (!m) continue;
    const label = a.querySelector('.menukad')?.text?.replace(/[​-‏‪-‮]/g, '').trim();
    if (label) out.push({ label, slug: m[1] });
  }
  return out;
}

export function parseDictPage(
  html: string,
): { voices?: { active?: Voice; passive?: Voice }; seeAlso: SeeAlsoRef[] } {
  const root = parse(html);

  const activeForms = readVoice(root, '');
  const passiveForms = readVoice(root, 'passive-');

  const voices: { active?: Voice; passive?: Voice } = {};
  if (hasForms(activeForms)) voices.active = { binyan: binyanFor(root, 'Active forms'), forms: activeForms };
  if (hasForms(passiveForms)) voices.passive = { binyan: binyanFor(root, 'Passive forms'), forms: passiveForms };

  return {
    voices: voices.active || voices.passive ? voices : undefined,
    seeAlso: parseSeeAlso(root),
  };
}
```

- [ ] **Step 4: Run tests + typecheck** — `cd worker && npm test -- dict-parser && npm run typecheck`
Expected: 3 dict-parser tests PASS; tsc clean.

- [ ] **Step 5: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Parse active+passive voices and see-also references"
```

---

## Task 5: D1-backed Store

**Files:** Create `worker/src/store.ts`, `worker/test/store.test.ts`. Modify `worker/package.json` (devdep).

**Interfaces:** Produces:
- `interface Store { get(query: string): Promise<LookupResult | null>; put(query: string, result: LookupResult): Promise<void>; }`
- `createD1Store(db: D1Database): Store`

Consumed by `lookup.ts` (Task 6) and `index.ts` (Task 7).

- [ ] **Step 1: Install the SQLite test driver**
```bash
cd worker && npm install -D better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Write `worker/test/store.test.ts`** (real SQLite via a tiny D1 adapter)
```ts
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
```

- [ ] **Step 3: Run to confirm failure** — `cd worker && npm test -- store`
Expected: FAIL (`../src/store` not found).

- [ ] **Step 4: Implement `worker/src/store.ts`**
```ts
import type { LookupResult } from './types';

export interface Store {
  get(query: string): Promise<LookupResult | null>;
  put(query: string, result: LookupResult): Promise<void>;
}

export function createD1Store(db: D1Database): Store {
  return {
    async get(query: string): Promise<LookupResult | null> {
      const row = await db
        .prepare('SELECT e.data AS data FROM aliases a JOIN entries e ON e.id = a.entry_id WHERE a.query_key = ?')
        .bind(query)
        .first<{ data: string }>();
      return row ? (JSON.parse(row.data) as LookupResult) : null;
    },

    async put(query: string, result: LookupResult): Promise<void> {
      const now = Date.now();
      const upserted = await db
        .prepare(
          `INSERT INTO entries (slug, lemma, root, translation, is_verb, binyan, data, source_url, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             lemma=excluded.lemma, root=excluded.root, translation=excluded.translation,
             is_verb=excluded.is_verb, binyan=excluded.binyan, data=excluded.data,
             source_url=excluded.source_url, fetched_at=excluded.fetched_at
           RETURNING id`,
        )
        .bind(
          result.slug,
          result.lemma,
          result.root,
          result.translation,
          result.isVerb ? 1 : 0,
          result.voices?.active?.binyan ?? null,
          JSON.stringify(result),
          result.sourceUrl,
          now,
        )
        .first<{ id: number }>();

      const entryId = upserted!.id;

      await db
        .prepare('INSERT OR IGNORE INTO aliases (query_key, entry_id, created_at) VALUES (?, ?, ?)')
        .bind(query, entryId, now)
        .run();

      for (const ref of result.seeAlso) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO see_also (from_id, to_slug, to_id, label)
             VALUES (?, ?, (SELECT id FROM entries WHERE slug = ?), ?)`,
          )
          .bind(entryId, ref.slug, ref.slug, ref.label)
          .run();
      }

      // Resolve any dangling references that point at this newly-stored slug.
      await db
        .prepare('UPDATE see_also SET to_id = ? WHERE to_slug = ? AND to_id IS NULL')
        .bind(entryId, result.slug)
        .run();
    },
  };
}
```

- [ ] **Step 5: Run tests + typecheck** — `cd worker && npm test -- store && npm run typecheck`
Expected: 4 store tests PASS; tsc clean. (`D1Database` resolves via `@cloudflare/workers-types`, present in both tsconfig projects.)

- [ ] **Step 6: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Add D1-backed Store with entries/aliases/see_also and FK backfill"
```

---

## Task 6: tiered lookup (KV → D1 → Pealim)

**Files:** Modify `worker/src/lookup.ts`, `worker/test/lookup.test.ts`.

**Interfaces:** Consumes `parseSearchResults`, `parseDictPage`, `Store`, `LookupResult`, `LookupError`. Produces:
- `lookup(rawQuery, deps?: { kv?: KVLike | null; store?: Store | null; fetchImpl?: typeof fetch }): Promise<LookupResult | LookupError>`
- `isError`, `normalizeQuery` (re-export), `interface KVLike` (unchanged from v1).

- [ ] **Step 1: Replace `worker/test/lookup.test.ts`**
```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookup, isError, normalizeQuery } from '../src/lookup';
import type { LookupResult } from '../src/types';
import type { Store } from '../src/store';

const f = (n: string) => readFileSync(`test/fixtures/${n}`, 'utf-8');
const searchVerb = f('search-levakesh.html');
const dictVerb = f('dict-levakesh.html');

function fakeFetch(map: Record<string, string>): typeof fetch {
  return (async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const key = Object.keys(map).find((k) => url.includes(k));
    return new Response(key ? map[key] : 'x', { status: key ? 200 : 404 });
  }) as unknown as typeof fetch;
}

function memStore(seed: Record<string, LookupResult> = {}): Store & { puts: number } {
  const m = new Map(Object.entries(seed));
  return {
    puts: 0,
    async get(q: string) { return m.get(q) ?? null; },
    async put(q: string, r: LookupResult) { (this as any).puts++; m.set(q, r); },
  };
}

describe('normalizeQuery', () => {
  it('strips surrounding punctuation', () => {
    expect(normalizeQuery('  «לבקש».  ')).toBe('לבקש');
  });
});

describe('lookup v2 tiers', () => {
  it('serves a verb from Pealim and writes through to the store', async () => {
    const store = memStore();
    const fetchImpl = fakeFetch({ '/search/': searchVerb, '/dict/255-levakesh/': dictVerb });
    const r = await lookup('לבקש', { store, fetchImpl });
    expect(isError(r)).toBe(false);
    if (isError(r)) return;
    expect(r.slug).toBe('255-levakesh');
    expect(r.voices?.active?.binyan).toBe("Pi'el");
    expect(r.voices?.passive?.binyan).toBe("Pu'al");
    expect(r.seeAlso.map((s) => s.slug)).toContain('3000-bakasha');
    expect(store.puts).toBe(1);
  });

  it('serves from the D1 store without touching Pealim (resilience)', async () => {
    const seeded: LookupResult = {
      word: 'לבקש', lemma: 'לְבַקֵּשׁ', slug: '255-levakesh', translation: 'to ask',
      root: 'ב־ק־שׁ', isVerb: true,
      voices: { active: { binyan: "Pi'el", forms: {} as any } }, seeAlso: [],
      sourceUrl: 'https://www.pealim.com/dict/255-levakesh/',
    };
    const store = memStore({ 'לבקש': seeded });
    const fetchImpl = vi.fn(fakeFetch({}));
    const r = await lookup('לבקש', { store, fetchImpl });
    expect(isError(r)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('KV hit short-circuits before the store', async () => {
    const kvVal: LookupResult = {
      word: 'לבקש', lemma: 'x', slug: '1-x', translation: 't', root: 'r', isVerb: false,
      seeAlso: [], sourceUrl: 'https://e',
    };
    const kv = { get: async () => kvVal, put: async () => {} };
    const store = memStore();
    const fetchImpl = vi.fn(fakeFetch({}));
    const r = await lookup('לבקש', { kv, store, fetchImpl });
    expect(isError(r) ? null : r.slug).toBe('1-x');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns NO_RESULTS when search has no result block', async () => {
    const r = await lookup('zzz', { fetchImpl: fakeFetch({ '/search/': '<html></html>' }) });
    expect(isError(r) && r.code).toBe('NO_RESULTS');
  });

  it('returns UPSTREAM on a non-2xx from Pealim', async () => {
    const r = await lookup('לבקש', { fetchImpl: (async () => new Response('x', { status: 503 })) as any });
    expect(isError(r) && r.code).toBe('UPSTREAM');
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `cd worker && npm test -- lookup`
Expected: FAIL (lookup still v1 shape; no `store` dep; no `voices`).

- [ ] **Step 3: Replace `worker/src/lookup.ts`**
```ts
import { parseSearchResults } from './search-parser';
import { parseDictPage } from './dict-parser';
import { normalizeQuery } from './normalize';
import type { Store } from './store';
import type { LookupResult, LookupError } from './types';

export { normalizeQuery };

export interface KVLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface LookupDeps {
  kv?: KVLike | null;
  store?: Store | null;
  fetchImpl?: typeof fetch;
}

const SEARCH_URL = (q: string) => `https://www.pealim.com/search/?q=${encodeURIComponent(q)}`;
const UA = 'Mozilla/5.0 (compatible; PealimLookupExtension/1.0; +https://www.pealim.com)';
const TTL = 2592000; // 30 days

export function isError(r: LookupResult | LookupError): r is LookupError {
  return (r as LookupError).code !== undefined;
}

async function getText(doFetch: typeof fetch, url: string): Promise<{ html: string } | LookupError> {
  try {
    const res = await doFetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { error: `Pealim returned ${res.status}`, code: 'UPSTREAM' };
    return { html: await res.text() };
  } catch (e) {
    console.error('[lookup] fetch failed:', url, e);
    return { error: `Pealim request failed: ${(e as Error).message}`, code: 'UPSTREAM' };
  }
}

export async function lookup(rawQuery: string, deps: LookupDeps = {}): Promise<LookupResult | LookupError> {
  const q = normalizeQuery(rawQuery);
  if (!q) return { error: 'Empty query', code: 'NO_RESULTS' };

  const doFetch = deps.fetchImpl ?? fetch;
  const kv = deps.kv ?? null;
  const store = deps.store ?? null;
  const cacheKey = `lookup:${q}`;

  // Tier 1: KV
  if (kv) {
    try {
      const cached = (await kv.get(cacheKey, 'json')) as LookupResult | null;
      if (cached) return cached;
    } catch (e) {
      console.error('[lookup] KV get failed:', e);
    }
  }

  // Tier 2: D1
  if (store) {
    try {
      const stored = await store.get(q);
      if (stored) {
        if (kv) {
          try { await kv.put(cacheKey, JSON.stringify(stored), { expirationTtl: TTL }); }
          catch (e) { console.error('[lookup] KV put failed:', e); }
        }
        return stored;
      }
    } catch (e) {
      console.error('[lookup] store get failed:', e);
    }
  }

  // Tier 3: Pealim
  const search = await getText(doFetch, SEARCH_URL(q));
  if (isError(search)) return search;
  const sr = parseSearchResults(search.html);
  if (!sr) return { error: `No Pealim entry for "${q}"`, code: 'NO_RESULTS' };

  const dictPage = await getText(doFetch, sr.dictUrl);
  if (isError(dictPage)) return dictPage;

  let parsed;
  try {
    parsed = parseDictPage(dictPage.html);
  } catch (e) {
    console.error('[lookup] dict parse failed:', e);
    return { error: "Couldn't read Pealim's page", code: 'PARSE' };
  }

  if (parsed.voices?.active && !parsed.voices.active.binyan && sr.binyan) {
    parsed.voices.active.binyan = sr.binyan;
  }

  const result: LookupResult = {
    word: q,
    lemma: sr.lemma,
    slug: sr.slug,
    translation: sr.translation,
    root: sr.root,
    isVerb: sr.isVerb,
    seeAlso: parsed.seeAlso,
    sourceUrl: sr.dictUrl,
  };
  if (parsed.voices) result.voices = parsed.voices;

  if (sr.isVerb && !result.voices?.active) {
    console.error('[lookup] verb with no active conjugation for', sr.dictUrl);
    return { error: "Couldn't read Pealim's conjugation page", code: 'PARSE' };
  }

  if (store) {
    try { await store.put(q, result); } catch (e) { console.error('[lookup] store put failed:', e); }
  }
  if (kv) {
    try { await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: TTL }); }
    catch (e) { console.error('[lookup] KV put failed:', e); }
  }
  return result;
}
```

- [ ] **Step 4: Run tests + typecheck** — `cd worker && npm test -- lookup && npm run typecheck`
Expected: lookup tests PASS; tsc clean.

- [ ] **Step 5: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Tiered KV→D1→Pealim lookup assembling v2 voices and see-also"
```

---

## Task 7: Worker entry — D1 binding + wiring

**Files:** Modify `worker/src/index.ts`, `worker/test/index.test.ts`.

**Interfaces:** Consumes `lookup`, `isError`, `createD1Store`, `KVLike`. Produces default `{ fetch }`; `interface Env { PEALIM_CACHE: KVLike; DB: D1Database }`.

- [ ] **Step 1: Update `worker/test/index.test.ts`** — change the env and the verb assertion. Replace the `env` line and the verb test body:
```ts
const env = { PEALIM_CACHE: null, DB: null } as any;
```
and in the "returns 200 + JSON for a verb" test, after `const body = await res.json() as any;`:
```ts
    expect(body.isVerb).toBe(true);
    expect(body.voices.active.binyan).toBe("Pi'el");
```
Also ensure the fetch stub returns the dict fixture for `/dict/` and the search fixture otherwise (it already does in v1).

- [ ] **Step 2: Run to confirm failure** — `cd worker && npm test -- index`
Expected: FAIL (body has no `voices` until index wires the new lookup; or type error on `Env`).

- [ ] **Step 3: Update `worker/src/index.ts`** — add the D1 binding + build a store. Replace the import line and `Env`, and the `lookup(...)` call:
```ts
import { lookup, isError } from './lookup';
import { createD1Store } from './store';

export interface Env {
  PEALIM_CACHE: KVLike;
  DB: D1Database;
}
```
(keep the `import type { KVLike } from './lookup';` — add it if missing), and inside `fetch`, replace the lookup call:
```ts
    const result = await lookup(q, {
      kv: env.PEALIM_CACHE ?? null,
      store: env.DB ? createD1Store(env.DB) : null,
    });
```
Everything else (CORS, `json()` helper, routing, status mapping) is unchanged.

- [ ] **Step 4: Run tests + full suite + typecheck** — `cd worker && npm test && npm run typecheck`
Expected: ALL worker tests PASS; tsc clean (both tsconfig projects).

- [ ] **Step 5: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Wire D1 store into worker entry; v2 contract end-to-end"
```

---

## Task 8: Local end-to-end verification (user-gated deploy)

> Deploy and any account-touching `wrangler` command are **gated on explicit user approval**. This task runs local verification; the deploy steps are documented for the user.

**Files:** Modify `worker/wrangler.toml` (DB id, at deploy time only).

- [ ] **Step 1: Full automated suite** — `cd worker && npm run typecheck && npm test`
Expected: all green (parsers, store, lookup, index, types).

- [ ] **Step 2: Apply migrations to the local D1 + start dev** (local only)
```bash
cd worker && npm run db:migrate:local && npm run dev
```
`wrangler dev` serves on `http://localhost:8787` with a local SQLite D1.

- [ ] **Step 3: Smoke-test v2 output against live Pealim**
```bash
curl -s "http://localhost:8787/lookup?q=%D7%9C%D7%91%D7%A7%D7%A9" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('slug',d['slug']);print('active',d['voices']['active']['binyan']);print('passive',d.get('voices',{}).get('passive',{}).get('binyan'));print('seeAlso',[s['slug'] for s in d['seeAlso']])"
```
Expected: `slug 255-levakesh`, `active Pi'el`, `passive Pu'al`, and seeAlso containing `3000-bakasha` etc.

- [ ] **Step 4: Verify D1 persistence / resilience** — look the same word up again and confirm it is served from D1 (stop is not required; a repeat call should be instant and a second, different inflection should also resolve). Optionally inspect the local DB:
```bash
cd worker && npx wrangler d1 execute pealim --local --command "SELECT slug, lemma FROM entries; SELECT COUNT(*) FROM see_also;"
```
Expected: the levakesh entry present; see_also rows recorded.

- [ ] **Step 5: Deploy (ONLY after explicit user "yes")**
```bash
cd worker
npm install -D wrangler@latest
npx wrangler d1 create pealim          # → copy database_id into wrangler.toml
npm run db:migrate:prod                # apply schema to remote D1
npx wrangler deploy
```
(KV namespace creation from v1 still applies if not already done.)

- [ ] **Step 6: Commit deploy config** (after deploy)
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Wire deployed D1 database id"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** tiered KV→D1→Pealim → Tasks 5–7; permanent D1 mirror + resilience → Tasks 5,6,8; passive forms + see-also parsing → Task 4; relational schema (entries/aliases/see_also, FK backfill) → Tasks 1,5; v2 contract → Task 2 + assembled in Task 6; No-Silent-Failures across tiers → Task 6. Accordion popup + context-menu trigger are **Plan 2** (extension), explicitly out of this plan. Crawler/stats/seeder/fallback are deferred per the spec.
- **Placeholder scan:** no TBD/TODO; every code step is complete; the `database_id` placeholder is replaced only at the user-gated deploy step.
- **Type consistency:** `LookupResult`/`Voice`/`SeeAlsoRef`/`Conjugation`/`SearchResult` defined in Task 2 and used verbatim in Tasks 3–7; `Store`/`createD1Store` defined in Task 5 and consumed in Tasks 6–7; conjugation key sets (`past.3p`; `future.3mp`+`3fp`) identical across parser, store seed, and tests; `parseDictPage` return shape (`{ voices?, seeAlso }`) consistent between Task 4 and its consumer in Task 6.
- **Testing-stack note:** `store.ts` is unit-tested against real SQLite via `better-sqlite3` (D1 is SQLite); `lookup.ts` orchestration uses in-memory `Store`/KV/fetch fakes; the live D1 path is integration-verified in Task 8 (`wrangler dev` local D1).
```
