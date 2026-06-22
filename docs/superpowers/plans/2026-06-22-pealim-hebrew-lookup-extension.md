# Pealim Hebrew Lookup — Implementation Plan (v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Chrome MV3 extension where double-clicking a Hebrew word shows a compact popup with its translation, root, and (for verbs) the Active-forms conjugation matrix — backed by a Cloudflare Worker that scrapes, parses, and caches pealim.com.

**Architecture:** Two deployables. (1) A **Cloudflare Worker** exposes `GET /lookup?q=<hebrew>` → JSON; it fetches Pealim's search page, parses the top result, and for verbs fetches+parses the dict page's Active-forms table, caching results in KV. (2) A **Chrome extension** (content script + background service worker) listens for double-clicks on Hebrew text, calls the Worker via the background worker (with a per-device `chrome.storage` cache), and renders an RTL popup in a Shadow DOM.

**Tech Stack:** TypeScript everywhere. Worker: plain Workers runtime + `node-html-parser` for parsing + Vitest. Extension: Vite + `@crxjs/vite-plugin` (MV3 bundling) + Vitest + happy-dom. No UI framework.

## Global Constraints

- **Manifest V3** Chrome extension; **vanilla TypeScript**, no UI framework.
- **Parsing library:** `node-html-parser` (pure-JS, runs in Workers *and* plain Vitest, supports `#id`/`.class` selectors). This is a deliberate refinement of the spec's "HTMLRewriter" note — extraction is by stable cell IDs and we want fixture-based unit tests without the workerd test harness. Pages are ~40KB so streaming is irrelevant.
- **Extension bundling:** `@crxjs/vite-plugin` (a Vite plugin, not a framework) handles MV3 content/background bundling so we avoid fragile hand-rolled rollup config.
- **Conjugation scope:** primary **Active forms** table only; Passive/secondary tables ignored.
- **Cell content:** vocalized Hebrew form only (first `.menukad` per cell). **Niqqud kept.** Transliteration and per-cell glosses dropped.
- **Result selection:** top Pealim match only; no disambiguation list.
- **Caching:** Worker KV `expirationTtl` = `2592000` (30 days). Extension `chrome.storage.local` for recent lookups.
- **Polite scraping:** browser-like `User-Agent` on every Pealim request; no parallelism beyond the at-most-2 fetches per lookup.
- **No Silent Failures:** every catch logs with context AND surfaces a user-visible message; structured `{ error, code }` from the Worker.
- **Git:** feature branch for implementation; `git add .` (never selective); commit messages descriptive, compact, **no AI/Claude attribution**. Do not commit/push unless explicitly asked beyond the per-task commits in this plan. **Never deploy** without explicit user approval.
- **Dependency versions:** install current latest at implementation time (`npm install <pkg>` / `@latest`); do not pin to versions guessed from memory.

---

## File Structure

```
pealim/
├── worker/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── wrangler.toml
│   ├── src/
│   │   ├── types.ts            # LookupResult, LookupError, Conjugation, SearchResult
│   │   ├── normalize.ts        # normalizeQuery()
│   │   ├── search-parser.ts    # parseSearchResults()
│   │   ├── dict-parser.ts      # parseDictPage()
│   │   ├── lookup.ts           # lookup() orchestration + isError()
│   │   └── index.ts            # Worker entry: routes GET /lookup, CORS
│   └── test/
│       ├── fixtures/           # dict-levakesh.html, search-levakesh.html, search-mevukash.html
│       ├── search-parser.test.ts
│       ├── dict-parser.test.ts
│       └── lookup.test.ts
└── extension/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── vitest.config.ts
    ├── manifest.json
    └── src/
        ├── types.ts            # LookupResult/LookupError mirror (documented contract copy)
        ├── config.ts           # WORKER_URL
        ├── hebrew.ts           # containsHebrew(), extractWord()
        ├── position.ts         # computePosition()
        ├── popup.ts            # renderPopup(), popup CSS string
        ├── content.ts          # dblclick listener + Shadow-DOM mount
        └── background.ts       # onMessage → storage cache → Worker fetch
```

---

## Task 1: Worker scaffold, types, and fixtures

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/vitest.config.ts`, `worker/wrangler.toml`
- Create: `worker/src/types.ts`
- Create (download): `worker/test/fixtures/{dict-levakesh,search-levakesh,search-mevukash}.html`
- Test: `worker/test/types.test.ts`

**Interfaces:**
- Produces: `LookupResult`, `LookupError`, `Conjugation`, `SearchResult` (consumed by every later Worker task and mirrored by the extension).

- [ ] **Step 1: Verify you are on the feature branch**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git branch --show-current   # must print: feature/pealim-lookup-v1
```
The branch `feature/pealim-lookup-v1` already exists and is checked out. If it is not current, run `git checkout feature/pealim-lookup-v1`. Do NOT create a new branch and do NOT work on `main`.

- [ ] **Step 2: Scaffold the Worker package and install deps**

```bash
mkdir -p worker/src worker/test/fixtures
cd worker
npm init -y
npm install node-html-parser
npm install -D typescript vitest wrangler @cloudflare/workers-types
```

- [ ] **Step 3: Write `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Set `worker/package.json` scripts**

Replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "wrangler dev",
  "deploy": "wrangler deploy",
  "typecheck": "tsc",
  "test": "vitest run"
},
"type": "module"
```

- [ ] **Step 5: Write `worker/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 6: Write `worker/wrangler.toml`** (KV `id` filled in at deploy time, Task 11)

```toml
name = "pealim-lookup"
main = "src/index.ts"
compatibility_date = "2026-06-22"

[[kv_namespaces]]
binding = "PEALIM_CACHE"
id = "PLACEHOLDER_FILL_AT_DEPLOY"
```

- [ ] **Step 7: Download the HTML fixtures** (reproducible, self-contained)

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
curl -sL -A "$UA" "https://www.pealim.com/dict/255-levakesh/" -o test/fixtures/dict-levakesh.html
curl -sL -A "$UA" "https://www.pealim.com/search/?q=%D7%9C%D7%91%D7%A7%D7%A9" -o test/fixtures/search-levakesh.html
curl -sL -A "$UA" "https://www.pealim.com/search/?from-nav=1&q=%D7%9E%D6%B0%D7%91%D7%95%D6%BC%D7%A7%D6%BC%D6%B8%D7%A9%D7%81" -o test/fixtures/search-mevukash.html
ls -l test/fixtures
```
Expected: three `.html` files, each > 10KB.

- [ ] **Step 8: Write `worker/src/types.ts`**

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

export interface LookupResult {
  word: string;
  lemma: string;
  translation: string;
  root: string;
  isVerb: boolean;
  binyan?: string;
  conjugation?: Conjugation;
  sourceUrl: string;
}

export type ErrorCode = 'NO_RESULTS' | 'UPSTREAM' | 'PARSE';

export interface LookupError {
  error: string;
  code: ErrorCode;
}

export interface SearchResult {
  lemma: string;
  root: string;
  translation: string;
  isVerb: boolean;
  dictUrl: string;
}
```

- [ ] **Step 9: Write a type-smoke test `worker/test/types.test.ts`**

```ts
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
```

- [ ] **Step 10: Run typecheck + test**

Run: `npm run typecheck && npm test`
Expected: tsc clean (no output, exit 0); 1 test passes.

- [ ] **Step 11: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Scaffold Pealim lookup worker with types and fixtures"
```

---

## Task 2: Search-results parser

**Files:**
- Create: `worker/src/search-parser.ts`
- Test: `worker/test/search-parser.test.ts`

**Interfaces:**
- Consumes: `SearchResult` from `types.ts`.
- Produces: `parseSearchResults(html: string): SearchResult | null` — returns `null` when no result block exists.

- [ ] **Step 1: Write the failing test `worker/test/search-parser.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd worker && npm test -- search-parser`
Expected: FAIL — "Cannot find module '../src/search-parser'".

- [ ] **Step 3: Implement `worker/src/search-parser.ts`**

```ts
import { parse } from 'node-html-parser';
import type { SearchResult } from './types';

const BASE = 'https://www.pealim.com';

export function parseSearchResults(html: string): SearchResult | null {
  const root = parse(html);
  const first = root.querySelector('.verb-search-result');
  if (!first) return null;

  const lemmaEl = first.querySelector('.verb-search-lemma');
  const dictLink =
    lemmaEl?.querySelector('a[href^="/dict/"]') ?? first.querySelector('a[href^="/dict/"]');
  const href = dictLink?.getAttribute('href');
  if (!href) return null;

  const lemma = (lemmaEl?.text ?? dictLink?.text ?? '').split('~')[0].replace(/\s+/g, ' ').trim();
  const root_ = (first.querySelector('.verb-search-root')?.text ?? '')
    .replace(/\s*-\s*/g, '־')
    .replace(/\s+/g, ' ')
    .trim();
  const translation = (first.querySelector('.verb-search-meaning')?.text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const buttonText = first.querySelector('.verb-search-button')?.text ?? '';
  const isVerb = /full conjugation/i.test(buttonText);

  return {
    lemma,
    root: root_,
    translation,
    isVerb,
    dictUrl: href.startsWith('http') ? href : BASE + href,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd worker && npm test -- search-parser`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Add Pealim search-results parser"
```

---

## Task 3: Dict-page (conjugation) parser

**Files:**
- Create: `worker/src/dict-parser.ts`
- Test: `worker/test/dict-parser.test.ts`

**Interfaces:**
- Consumes: `Conjugation` from `types.ts`.
- Produces: `parseDictPage(html: string): { binyan: string | null; conjugation: Conjugation }`.

- [ ] **Step 1: Write the failing test `worker/test/dict-parser.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDictPage } from '../src/dict-parser';

const html = readFileSync(new URL('./fixtures/dict-levakesh.html', import.meta.url), 'utf-8');

describe('parseDictPage', () => {
  const { binyan, conjugation } = parseDictPage(html);

  it("reads the Active-forms binyan", () => {
    expect(binyan).toBe("Pi'el");
  });

  it('reads present-tense masculine singular (AP-ms)', () => {
    expect(conjugation.present.ms.replace(/\p{Mn}/gu, '')).toMatch(/מבקש/);
  });

  it('reads the infinitive (INF-L)', () => {
    expect(conjugation.infinitive.replace(/\p{Mn}/gu, '')).toMatch(/לבקש/);
  });

  it('fills every Active-forms coordinate (non-empty)', () => {
    const all = [
      ...Object.values(conjugation.present),
      ...Object.values(conjugation.past),
      ...Object.values(conjugation.future),
      ...Object.values(conjugation.imperative),
      conjugation.infinitive,
    ];
    expect(all.every((s) => s.length > 0)).toBe(true);
  });

  it('does NOT pull from the Passive-forms table', () => {
    // AP-ms is the active present m.sg.; passive cells are prefixed `passive-`.
    expect(conjugation.present.ms.replace(/\p{Mn}/gu, '')).not.toMatch(/מבוקש/);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd worker && npm test -- dict-parser`
Expected: FAIL — "Cannot find module '../src/dict-parser'".

- [ ] **Step 3: Implement `worker/src/dict-parser.ts`**

```ts
import { parse, type HTMLElement } from 'node-html-parser';
import type { Conjugation } from './types';

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

const IMP_IDS = {
  '2ms': 'IMP-2ms', '2fs': 'IMP-2fs', '2mp': 'IMP-2mp', '2fp': 'IMP-2fp',
} as const;

function formById(root: HTMLElement, id: string): string {
  const cell = root.querySelector(`#${id}`);
  if (!cell) return '';
  const menukad = cell.querySelector('.menukad');
  const raw = menukad?.text ?? cell.text ?? '';
  return raw.split('~')[0].replace(/\s+/g, ' ').trim();
}

function mapForms<K extends string>(
  root: HTMLElement,
  ids: Record<K, string>,
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(ids) as K[]) out[key] = formById(root, ids[key]);
  return out;
}

export function parseDictPage(html: string): { binyan: string | null; conjugation: Conjugation } {
  const root = parse(html);

  let binyan: string | null = null;
  for (const h of root.querySelectorAll('h3.page-header')) {
    if (h.text.trim().startsWith('Active forms')) {
      const small = h.querySelector('.small')?.text ?? '';
      binyan = small.replace(/^Binyan\s+/i, '').trim() || null;
      break;
    }
  }

  const conjugation: Conjugation = {
    present: {
      ms: formById(root, 'AP-ms'),
      fs: formById(root, 'AP-fs'),
      mp: formById(root, 'AP-mp'),
      fp: formById(root, 'AP-fp'),
    },
    past: mapForms(root, PAST_IDS),
    future: mapForms(root, FUTURE_IDS),
    imperative: mapForms(root, IMP_IDS),
    infinitive: formById(root, 'INF-L'),
  };

  return { binyan, conjugation };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd worker && npm test -- dict-parser`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Add Pealim dict-page conjugation parser"
```

---

## Task 4: Query normalization + lookup orchestration

**Files:**
- Create: `worker/src/normalize.ts`, `worker/src/lookup.ts`
- Test: `worker/test/lookup.test.ts`

**Interfaces:**
- Consumes: `parseSearchResults`, `parseDictPage`, `LookupResult`, `LookupError`.
- Produces:
  - `normalizeQuery(raw: string): string`
  - `lookup(rawQuery: string, deps?: { kv?: KVLike | null; fetchImpl?: typeof fetch }): Promise<LookupResult | LookupError>`
  - `isError(r: LookupResult | LookupError): r is LookupError`
  - `interface KVLike { get(k: string, t: 'json'): Promise<unknown>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void>; }`

- [ ] **Step 1: Write `worker/src/normalize.ts`**

```ts
export function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[“”‘’"'.,;:!?()\[\]{}<>״׳]+|[“”‘’"'.,;:!?()\[\]{}<>״׳]+$/gu, '')
    .trim();
}
```

- [ ] **Step 2: Write the failing test `worker/test/lookup.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookup, isError, normalizeQuery } from '../src/lookup';

const f = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf-8');
const searchVerb = f('search-levakesh.html');
const dict = f('dict-levakesh.html');
const searchAdj = f('search-mevukash.html');

function fakeFetch(map: Record<string, string>): typeof fetch {
  return (async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const key = Object.keys(map).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(map[key], { status: 200 });
  }) as unknown as typeof fetch;
}

describe('normalizeQuery', () => {
  it('strips surrounding punctuation and whitespace', () => {
    expect(normalizeQuery('  «לבקש».  ')).toBe('לבקש');
  });
});

describe('lookup', () => {
  it('returns a full verb result (search + dict)', async () => {
    const fetchImpl = fakeFetch({ '/search/': searchVerb, '/dict/255-levakesh/': dict });
    const r = await lookup('לבקש', { fetchImpl });
    expect(isError(r)).toBe(false);
    if (isError(r)) return;
    expect(r.isVerb).toBe(true);
    expect(r.binyan).toBe("Pi'el");
    expect(r.conjugation!.infinitive.replace(/\p{Mn}/gu, '')).toMatch(/לבקש/);
    expect(r.translation.toLowerCase()).toMatch(/ask|request/);
  });

  it('returns a non-verb result without fetching a dict page', async () => {
    const dictSpy = vi.fn();
    const fetchImpl = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/dict/')) dictSpy();
      return new Response(searchAdj, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await lookup('מבוקש', { fetchImpl });
    expect(isError(r)).toBe(false);
    if (isError(r)) return;
    expect(r.isVerb).toBe(false);
    expect(r.conjugation).toBeUndefined();
    expect(dictSpy).not.toHaveBeenCalled();
  });

  it('returns NO_RESULTS when search has no result block', async () => {
    const fetchImpl = fakeFetch({ '/search/': '<html><body>empty</body></html>' });
    const r = await lookup('zzz', { fetchImpl });
    expect(isError(r) && r.code).toBe('NO_RESULTS');
  });

  it('returns UPSTREAM on non-2xx from Pealim', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 503 })) as unknown as typeof fetch;
    const r = await lookup('לבקש', { fetchImpl });
    expect(isError(r) && r.code).toBe('UPSTREAM');
  });

  it('serves from KV cache on the second call', async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
      put: async (k: string, v: string) => void store.set(k, v),
    };
    const fetchImpl = vi.fn(fakeFetch({ '/search/': searchVerb, '/dict/255-levakesh/': dict }));
    await lookup('לבקש', { kv, fetchImpl });
    const callsAfterFirst = fetchImpl.mock.calls.length;
    await lookup('לבקש', { kv, fetchImpl });
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst); // no new fetches
  });
});
```

- [ ] **Step 3: Run it to confirm failure**

Run: `cd worker && npm test -- lookup`
Expected: FAIL — "Cannot find module '../src/lookup'".

- [ ] **Step 4: Implement `worker/src/lookup.ts`**

```ts
import { parseSearchResults } from './search-parser';
import { parseDictPage } from './dict-parser';
import { normalizeQuery } from './normalize';
import type { LookupResult, LookupError } from './types';

export { normalizeQuery };

export interface KVLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface LookupDeps {
  kv?: KVLike | null;
  fetchImpl?: typeof fetch;
}

const SEARCH_URL = (q: string) => `https://www.pealim.com/search/?q=${encodeURIComponent(q)}`;
const UA = 'Mozilla/5.0 (compatible; PealimLookupExtension/1.0; +https://www.pealim.com)';
const TTL = 2592000; // 30 days

export function isError(r: LookupResult | LookupError): r is LookupError {
  return (r as LookupError).code !== undefined;
}

async function getText(
  doFetch: typeof fetch,
  url: string,
): Promise<{ html: string } | LookupError> {
  try {
    const res = await doFetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { error: `Pealim returned ${res.status}`, code: 'UPSTREAM' };
    return { html: await res.text() };
  } catch (e) {
    console.error('[lookup] fetch failed:', url, e);
    return { error: `Pealim request failed: ${(e as Error).message}`, code: 'UPSTREAM' };
  }
}

export async function lookup(
  rawQuery: string,
  deps: LookupDeps = {},
): Promise<LookupResult | LookupError> {
  const q = normalizeQuery(rawQuery);
  if (!q) return { error: 'Empty query', code: 'NO_RESULTS' };

  const doFetch = deps.fetchImpl ?? fetch;
  const kv = deps.kv ?? null;
  const cacheKey = `lookup:${q}`;

  if (kv) {
    const cached = (await kv.get(cacheKey, 'json')) as LookupResult | null;
    if (cached) return cached;
  }

  const search = await getText(doFetch, SEARCH_URL(q));
  if (isError(search)) return search;

  const sr = parseSearchResults(search.html);
  if (!sr) return { error: `No Pealim entry for "${q}"`, code: 'NO_RESULTS' };

  const result: LookupResult = {
    word: q,
    lemma: sr.lemma,
    translation: sr.translation,
    root: sr.root,
    isVerb: sr.isVerb,
    sourceUrl: sr.dictUrl,
  };

  if (sr.isVerb) {
    const dictPage = await getText(doFetch, sr.dictUrl);
    if (isError(dictPage)) return dictPage;
    const { binyan, conjugation } = parseDictPage(dictPage.html);
    if (binyan) result.binyan = binyan;
    result.conjugation = conjugation;
  }

  if (kv) await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: TTL });
  return result;
}
```

- [ ] **Step 5: Run the tests**

Run: `cd worker && npm test -- lookup`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Add lookup orchestration with KV caching and query normalization"
```

---

## Task 5: Worker HTTP entry (`GET /lookup` + CORS)

**Files:**
- Create: `worker/src/index.ts`
- Test: `worker/test/index.test.ts`

**Interfaces:**
- Consumes: `lookup`, `isError`.
- Produces: default export `{ fetch(request, env) }`; `interface Env { PEALIM_CACHE: KVNamespace }`.

- [ ] **Step 1: Write the failing test `worker/test/index.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../src/index';

const f = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf-8');

const env = { PEALIM_CACHE: null } as any;

describe('worker.fetch', () => {
  it('400s when q is missing', async () => {
    const res = await worker.fetch(new Request('https://w/lookup'), env);
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('404s on unknown path', async () => {
    const res = await worker.fetch(new Request('https://w/other'), env);
    expect(res.status).toBe(404);
  });

  it('answers OPTIONS preflight with CORS', async () => {
    const res = await worker.fetch(new Request('https://w/lookup', { method: 'OPTIONS' }), env);
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/GET/);
  });

  it('returns 200 + JSON for a verb', async () => {
    vi.stubGlobal('fetch', (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      return new Response(url.includes('/dict/') ? f('dict-levakesh.html') : f('search-levakesh.html'), { status: 200 });
    }) as any);
    const res = await worker.fetch(new Request('https://w/lookup?q=' + encodeURIComponent('לבקש')), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isVerb).toBe(true);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd worker && npm test -- index`
Expected: FAIL — "Cannot find module '../src/index'".

- [ ] **Step 3: Implement `worker/src/index.ts`**

```ts
import { lookup, isError } from './lookup';

export interface Env {
  PEALIM_CACHE: KVNamespace;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Build JSON responses without relying on the static Response.json() helper,
// which is not available in every test runtime.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/lookup') {
      return json({ error: 'Not found', code: 'NO_RESULTS' }, 404);
    }

    const q = url.searchParams.get('q') ?? '';
    if (!q.trim()) {
      return json({ error: 'Missing q parameter', code: 'NO_RESULTS' }, 400);
    }

    const result = await lookup(q, { kv: env.PEALIM_CACHE ?? null });
    const status = isError(result) ? (result.code === 'NO_RESULTS' ? 404 : 502) : 200;
    return json(result, status);
  },
};
```

- [ ] **Step 4: Run the tests + typecheck**

Run: `cd worker && npm test && npm run typecheck`
Expected: all tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Add worker HTTP entry with /lookup route and CORS"
```

---

## Task 6: Extension scaffold + Hebrew helpers

**Files:**
- Create: `extension/package.json`, `extension/tsconfig.json`, `extension/vite.config.ts`, `extension/vitest.config.ts`, `extension/manifest.json`
- Create: `extension/src/types.ts`, `extension/src/config.ts`, `extension/src/hebrew.ts`
- Test: `extension/test/hebrew.test.ts`

**Interfaces:**
- Produces:
  - `containsHebrew(text: string): boolean`
  - `extractWord(selection: string): string`
  - `WORKER_URL: string` (from `config.ts`)
  - extension-side `LookupResult` / `LookupError` (mirror of the Worker contract)

- [ ] **Step 1: Scaffold the extension package and install deps**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
mkdir -p extension/src extension/test
cd extension
npm init -y
npm install -D typescript vite @crxjs/vite-plugin vitest happy-dom @types/chrome
```

- [ ] **Step 2: Write `extension/package.json` scripts**

Replace `"scripts"` with (and add `"type": "module"`):

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "typecheck": "tsc",
  "test": "vitest run"
},
"type": "module"
```

- [ ] **Step 3: Write `extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Write `extension/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'happy-dom' },
});
```

- [ ] **Step 5: Write `extension/manifest.json`** (host_permissions URL is finalized in Task 11)

```json
{
  "manifest_version": 3,
  "name": "Pealim Hebrew Lookup",
  "version": "1.0.0",
  "description": "Double-click a Hebrew word to see its translation, root, and verb conjugation from Pealim.",
  "permissions": ["storage"],
  "host_permissions": ["http://localhost:8787/*", "https://pealim-lookup.PLACEHOLDER.workers.dev/*"],
  "background": { "service_worker": "src/background.ts", "type": "module" },
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["src/content.ts"], "run_at": "document_idle" }
  ]
}
```

- [ ] **Step 6: Write `extension/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
});
```

- [ ] **Step 7: Write `extension/src/config.ts`**

```ts
// Local dev uses `wrangler dev` on :8787. After deploying (Task 11), replace
// this with your real workers.dev URL and update manifest host_permissions.
export const WORKER_URL = 'http://localhost:8787';
```

- [ ] **Step 8: Write `extension/src/types.ts`** (mirror of the Worker contract; kept in sync manually)

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

export interface LookupResult {
  word: string;
  lemma: string;
  translation: string;
  root: string;
  isVerb: boolean;
  binyan?: string;
  conjugation?: Conjugation;
  sourceUrl: string;
}

export interface LookupError {
  error: string;
  code: 'NO_RESULTS' | 'UPSTREAM' | 'PARSE';
}

export type LookupResponse = LookupResult | LookupError;

export interface LookupMessage {
  type: 'lookup';
  word: string;
}

export function isLookupError(r: LookupResponse): r is LookupError {
  return (r as LookupError).code !== undefined;
}
```

- [ ] **Step 9: Write the failing test `extension/test/hebrew.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { containsHebrew, extractWord } from '../src/hebrew';

describe('containsHebrew', () => {
  it('detects Hebrew letters', () => {
    expect(containsHebrew('לבקש')).toBe(true);
    expect(containsHebrew('מְבֻקָּשׁ')).toBe(true); // with niqqud
  });
  it('rejects non-Hebrew', () => {
    expect(containsHebrew('hello')).toBe(false);
    expect(containsHebrew('123 .,!')).toBe(false);
  });
});

describe('extractWord', () => {
  it('trims and takes the first token', () => {
    expect(extractWord('  לבקש  ')).toBe('לבקש');
    expect(extractWord('לבקש מאוד')).toBe('לבקש');
  });
});
```

- [ ] **Step 10: Run it to confirm failure**

Run: `cd extension && npm test -- hebrew`
Expected: FAIL — "Cannot find module '../src/hebrew'".

- [ ] **Step 11: Implement `extension/src/hebrew.ts`**

```ts
const HEBREW_LETTER = /[א-ת]/; // Hebrew letters (excludes niqqud/punct alone)

export function containsHebrew(text: string): boolean {
  return HEBREW_LETTER.test(text);
}

export function extractWord(selection: string): string {
  return selection.trim().split(/\s+/)[0] ?? '';
}
```

- [ ] **Step 12: Run the tests + typecheck**

Run: `cd extension && npm test -- hebrew && npm run typecheck`
Expected: PASS; tsc clean.

- [ ] **Step 13: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Scaffold Chrome extension with manifest, types, and Hebrew helpers"
```

---

## Task 7: Popup rendering (RTL, adaptive matrix)

**Files:**
- Create: `extension/src/popup.ts`
- Test: `extension/test/popup.test.ts`

**Interfaces:**
- Consumes: `LookupResponse`, `LookupResult`, `LookupError`, `isLookupError`.
- Produces:
  - `renderPopup(data: LookupResponse): HTMLElement` — a detached `<div class="pealim-popup">`.
  - `renderLoading(word: string): HTMLElement`
  - `POPUP_CSS: string` (injected into the Shadow DOM by `content.ts`).

- [ ] **Step 1: Write the failing test `extension/test/popup.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderPopup } from '../src/popup';
import type { LookupResult } from '../src/types';

const verb: LookupResult = {
  word: 'לבקש', lemma: 'לְבַקֵּשׁ', translation: 'to ask, to request', root: 'ב־ק־שׁ',
  isVerb: true, binyan: "Pi'el",
  conjugation: {
    present: { ms: 'מְבַקֵּשׁ', fs: 'מְבַקֶּשֶׁת', mp: 'מְבַקְשִׁים', fp: 'מְבַקְשׁוֹת' },
    past: { '1s': 'בִּקַּשְׁתִּי', '1p': 'בִּקַּשְׁנוּ', '2ms': 'בִּקַּשְׁתָּ', '2fs': 'בִּקַּשְׁתְּ', '2mp': 'בִּקַּשְׁתֶּם', '2fp': 'בִּקַּשְׁתֶּן', '3ms': 'בִּקֵּשׁ', '3fs': 'בִּקְּשָׁה', '3p': 'בִּקְּשׁוּ' },
    future: { '1s': 'אֲבַקֵּשׁ', '1p': 'נְבַקֵּשׁ', '2ms': 'תְּבַקֵּשׁ', '2fs': 'תְּבַקְשִׁי', '2mp': 'תְּבַקְשׁוּ', '2fp': 'תְּבַקֵּשְׁנָה', '3ms': 'יְבַקֵּשׁ', '3fs': 'תְּבַקֵּשׁ', '3mp': 'יְבַקְשׁוּ', '3fp': 'תְּבַקֵּשְׁנָה' },
    imperative: { '2ms': 'בַּקֵּשׁ', '2fs': 'בַּקְשִׁי', '2mp': 'בַּקְשׁוּ', '2fp': 'בַּקֵּשְׁנָה' },
    infinitive: 'לְבַקֵּשׁ',
  },
  sourceUrl: 'https://www.pealim.com/dict/255-levakesh/',
};

const adj: LookupResult = {
  word: 'מבוקש', lemma: 'מְבוּקָּשׁ', translation: 'wanted, required, desired', root: 'ב־ק־שׁ',
  isVerb: false, sourceUrl: 'https://www.pealim.com/dict/9321-mevukash/',
};

describe('renderPopup', () => {
  it('renders header for any word', () => {
    const el = renderPopup(adj);
    expect(el.getAttribute('dir')).toBe('rtl');
    expect(el.textContent).toContain('מְבוּקָּשׁ');
    expect(el.textContent).toContain('wanted, required, desired');
    expect(el.textContent).toContain('ב־ק־שׁ');
    expect(el.querySelector('table')).toBeNull(); // no matrix for non-verb
  });

  it('renders the conjugation matrix for verbs', () => {
    const el = renderPopup(verb);
    const table = el.querySelector('table');
    expect(table).not.toBeNull();
    expect(el.textContent).toContain("Pi'el");
    expect(el.textContent).toContain('מְבַקֵּשׁ');   // present ms
    expect(el.textContent).toContain('בִּקֵּשׁ');     // past 3ms
    expect(el.textContent).toContain('יְבַקֵּשׁ');    // future 3ms
    expect(el.textContent).toContain('בַּקֵּשׁ');     // imperative 2ms
    expect(el.textContent).toContain('לְבַקֵּשׁ');    // infinitive
  });

  it('renders an error message', () => {
    const el = renderPopup({ error: 'No Pealim entry for "xyz"', code: 'NO_RESULTS' });
    expect(el.classList.contains('pealim-error')).toBe(true);
    expect(el.textContent).toContain('No Pealim entry');
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd extension && npm test -- popup`
Expected: FAIL — "Cannot find module '../src/popup'".

- [ ] **Step 3: Implement `extension/src/popup.ts`**

```ts
import { type LookupResponse, type LookupResult, isLookupError } from './types';

export const POPUP_CSS = `
.pealim-popup {
  all: initial;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  direction: rtl; text-align: right;
  background: #fff; color: #1a1a1a;
  border: 1px solid #d0d0d0; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  padding: 10px 12px; max-width: 360px; font-size: 15px; line-height: 1.4;
}
.pealim-popup .pealim-lemma { font-size: 20px; font-weight: 700; }
.pealim-popup .pealim-translation { margin-top: 2px; color: #333; }
.pealim-popup .pealim-meta { margin-top: 4px; font-size: 13px; color: #666; }
.pealim-popup table { border-collapse: collapse; margin-top: 8px; width: 100%; }
.pealim-popup th, .pealim-popup td {
  border: 1px solid #e3e3e3; padding: 3px 6px; text-align: center; font-size: 14px;
}
.pealim-popup th { background: #f5f5f5; font-weight: 600; font-size: 12px; color: #555; }
.pealim-popup td.pealim-rowlabel { background: #fafafa; font-size: 12px; color: #555; }
.pealim-popup .pealim-source { margin-top: 6px; font-size: 12px; }
.pealim-popup .pealim-source a { color: #2563eb; text-decoration: none; }
.pealim-popup.pealim-error { color: #b00020; }
.pealim-popup.pealim-loading { color: #666; }
`;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function td(text: string, span = 1, cls = ''): HTMLTableCellElement {
  const c = document.createElement('td');
  c.textContent = text;
  if (span > 1) c.colSpan = span;
  if (cls) c.className = cls;
  return c;
}

function th(text: string, span = 1): HTMLTableCellElement {
  const c = document.createElement('th');
  c.textContent = text;
  if (span > 1) c.colSpan = span;
  return c;
}

function buildMatrix(r: LookupResult): HTMLTableElement {
  const c = r.conjugation!;
  const table = document.createElement('table');

  // Header rows: Singular(M,F) | Plural(M,F)
  const h1 = document.createElement('tr');
  h1.appendChild(th(''));
  h1.appendChild(th('Singular', 2));
  h1.appendChild(th('Plural', 2));
  const h2 = document.createElement('tr');
  h2.appendChild(th(''));
  h2.appendChild(th('M')); h2.appendChild(th('F'));
  h2.appendChild(th('M')); h2.appendChild(th('F'));
  table.appendChild(h1); table.appendChild(h2);

  const row = (label: string, cells: HTMLTableCellElement[]) => {
    const tr = document.createElement('tr');
    tr.appendChild(td(label, 1, 'pealim-rowlabel'));
    cells.forEach((x) => tr.appendChild(x));
    table.appendChild(tr);
  };

  row('Present', [td(c.present.ms), td(c.present.fs), td(c.present.mp), td(c.present.fp)]);
  row('Past 1', [td(c.past['1s'], 2), td(c.past['1p'], 2)]);
  row('Past 2', [td(c.past['2ms']), td(c.past['2fs']), td(c.past['2mp']), td(c.past['2fp'])]);
  row('Past 3', [td(c.past['3ms']), td(c.past['3fs']), td(c.past['3p'], 2)]);
  row('Future 1', [td(c.future['1s'], 2), td(c.future['1p'], 2)]);
  row('Future 2', [td(c.future['2ms']), td(c.future['2fs']), td(c.future['2mp']), td(c.future['2fp'])]);
  row('Future 3', [td(c.future['3ms']), td(c.future['3fs']), td(c.future['3mp']), td(c.future['3fp'])]);
  row('Imperative', [td(c.imperative['2ms']), td(c.imperative['2fs']), td(c.imperative['2mp']), td(c.imperative['2fp'])]);
  row('Infinitive', [td(c.infinitive, 4)]);

  return table;
}

export function renderPopup(data: LookupResponse): HTMLElement {
  const wrap = el('div', 'pealim-popup');
  wrap.setAttribute('dir', 'rtl');

  if (isLookupError(data)) {
    wrap.classList.add('pealim-error');
    wrap.appendChild(el('div', 'pealim-errmsg', data.error));
    return wrap;
  }

  wrap.appendChild(el('div', 'pealim-lemma', data.lemma || data.word));
  if (data.translation) wrap.appendChild(el('div', 'pealim-translation', data.translation));

  const metaBits = [data.root ? `root ${data.root}` : '', data.binyan ?? ''].filter(Boolean);
  if (metaBits.length) wrap.appendChild(el('div', 'pealim-meta', metaBits.join(' · ')));

  if (data.isVerb && data.conjugation) wrap.appendChild(buildMatrix(data));

  const src = el('div', 'pealim-source');
  const a = document.createElement('a');
  a.href = data.sourceUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Pealim ↗';
  src.appendChild(a);
  wrap.appendChild(src);
  return wrap;
}

export function renderLoading(word: string): HTMLElement {
  const wrap = el('div', 'pealim-popup pealim-loading');
  wrap.setAttribute('dir', 'rtl');
  wrap.appendChild(el('div', undefined, `…${word}`));
  return wrap;
}
```

- [ ] **Step 4: Run the tests + typecheck**

Run: `cd extension && npm test -- popup && npm run typecheck`
Expected: PASS (3 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Add RTL popup renderer with adaptive conjugation matrix"
```

---

## Task 8: Popup positioning helper

**Files:**
- Create: `extension/src/position.ts`
- Test: `extension/test/position.test.ts`

**Interfaces:**
- Produces: `computePosition(anchor: {left:number;top:number;bottom:number;right:number}, popup: {width:number;height:number}, viewport: {width:number;height:number}, gap?: number): {left:number; top:number}` — keeps the popup inside the viewport, preferring below-then-above the anchor.

- [ ] **Step 1: Write the failing test `extension/test/position.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computePosition } from '../src/position';

const vp = { width: 1000, height: 800 };
const popup = { width: 360, height: 300 };

describe('computePosition', () => {
  it('places below the anchor when there is room', () => {
    const p = computePosition({ left: 100, top: 100, bottom: 120, right: 160 }, popup, vp);
    expect(p.top).toBeGreaterThanOrEqual(120);
    expect(p.top).toBeLessThan(800);
  });

  it('flips above when there is no room below', () => {
    const p = computePosition({ left: 100, top: 700, bottom: 760, right: 160 }, popup, vp);
    expect(p.top + popup.height).toBeLessThanOrEqual(800);
  });

  it('clamps horizontally within the viewport', () => {
    const p = computePosition({ left: 980, top: 100, bottom: 120, right: 999 }, popup, vp);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.left + popup.width).toBeLessThanOrEqual(1000);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd extension && npm test -- position`
Expected: FAIL — "Cannot find module '../src/position'".

- [ ] **Step 3: Implement `extension/src/position.ts`**

```ts
interface Rect { left: number; top: number; bottom: number; right: number }
interface Size { width: number; height: number }

export function computePosition(
  anchor: Rect,
  popup: Size,
  viewport: Size,
  gap = 6,
): { left: number; top: number } {
  const roomBelow = viewport.height - anchor.bottom;
  let top =
    roomBelow >= popup.height + gap
      ? anchor.bottom + gap
      : Math.max(0, anchor.top - popup.height - gap);
  top = Math.min(top, Math.max(0, viewport.height - popup.height));

  let left = anchor.left;
  left = Math.min(left, viewport.width - popup.width);
  left = Math.max(0, left);

  return { left, top };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd extension && npm test -- position`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Add viewport-aware popup positioning helper"
```

---

## Task 9: Background service worker (messaging + cache + Worker fetch)

**Files:**
- Create: `extension/src/cache-key.ts` (pure, testable), `extension/src/background.ts`
- Test: `extension/test/cache-key.test.ts`

**Interfaces:**
- Consumes: `WORKER_URL`, `LookupResponse`, `LookupMessage`.
- Produces:
  - `cacheKeyFor(word: string): string`
  - `background.ts` registers `chrome.runtime.onMessage` handling `{ type: 'lookup', word }` → `LookupResponse`.

- [ ] **Step 1: Write the failing test `extension/test/cache-key.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { cacheKeyFor } from '../src/cache-key';

describe('cacheKeyFor', () => {
  it('namespaces and trims the word', () => {
    expect(cacheKeyFor('  לבקש ')).toBe('pealim:לבקש');
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd extension && npm test -- cache-key`
Expected: FAIL — "Cannot find module '../src/cache-key'".

- [ ] **Step 3: Implement `extension/src/cache-key.ts`**

```ts
export function cacheKeyFor(word: string): string {
  return `pealim:${word.trim()}`;
}
```

- [ ] **Step 4: Run the test**

Run: `cd extension && npm test -- cache-key`
Expected: PASS.

- [ ] **Step 5: Implement `extension/src/background.ts`** (Chrome-API parts verified manually in Task 11)

```ts
import { WORKER_URL } from './config';
import { cacheKeyFor } from './cache-key';
import type { LookupResponse, LookupMessage } from './types';

async function fetchLookup(word: string): Promise<LookupResponse> {
  const key = cacheKeyFor(word);

  try {
    const cached = await chrome.storage.local.get(key);
    if (cached[key]) return cached[key] as LookupResponse;
  } catch (e) {
    console.error('[pealim] storage read failed:', e);
  }

  try {
    const res = await fetch(`${WORKER_URL}/lookup?q=${encodeURIComponent(word)}`);
    const data = (await res.json()) as LookupResponse;
    if (!('code' in data)) {
      try {
        await chrome.storage.local.set({ [key]: data });
      } catch (e) {
        console.error('[pealim] storage write failed:', e);
      }
    }
    return data;
  } catch (e) {
    console.error('[pealim] worker fetch failed:', e);
    return { error: `Lookup failed: ${(e as Error).message}`, code: 'UPSTREAM' };
  }
}

chrome.runtime.onMessage.addListener((msg: LookupMessage, _sender, sendResponse) => {
  if (msg?.type !== 'lookup') return false;
  fetchLookup(msg.word).then(sendResponse);
  return true; // keep the message channel open for the async response
});
```

- [ ] **Step 6: Typecheck**

Run: `cd extension && npm run typecheck`
Expected: tsc clean.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Add background worker with storage cache and lookup messaging"
```

---

## Task 10: Content script (double-click trigger + Shadow-DOM popup)

**Files:**
- Create: `extension/src/content.ts`
- Test: none automated (DOM/selection/chrome APIs verified manually in Task 11). Pure helpers it relies on (`containsHebrew`, `extractWord`, `computePosition`, `renderPopup`) are already tested.

**Interfaces:**
- Consumes: `containsHebrew`, `extractWord`, `computePosition`, `renderPopup`, `renderLoading`, `POPUP_CSS`, `LookupMessage`, `LookupResponse`.

- [ ] **Step 1: Implement `extension/src/content.ts`**

```ts
import { containsHebrew, extractWord } from './hebrew';
import { computePosition } from './position';
import { renderPopup, renderLoading, POPUP_CSS } from './popup';
import type { LookupMessage, LookupResponse } from './types';

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;

function ensureHost(): ShadowRoot {
  if (host && shadow) return shadow;
  host = document.createElement('div');
  host.style.cssText = 'position:absolute;z-index:2147483647;top:0;left:0;';
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = POPUP_CSS;
  shadow.appendChild(style);
  document.body.appendChild(host);
  return shadow;
}

function dismiss(): void {
  if (host) {
    host.remove();
    host = null;
    shadow = null;
  }
}

function showNode(node: HTMLElement, anchor: DOMRect): void {
  const root = ensureHost();
  root.querySelectorAll('.pealim-popup').forEach((n) => n.remove());
  root.appendChild(node);

  const size = node.getBoundingClientRect();
  const pos = computePosition(
    { left: anchor.left, top: anchor.top, right: anchor.right, bottom: anchor.bottom },
    { width: size.width || 360, height: size.height || 200 },
    { width: window.innerWidth, height: window.innerHeight },
  );
  host!.style.left = `${pos.left + window.scrollX}px`;
  host!.style.top = `${pos.top + window.scrollY}px`;
}

document.addEventListener('dblclick', async () => {
  const sel = window.getSelection();
  const text = sel?.toString() ?? '';
  if (!text || !containsHebrew(text)) return;

  const word = extractWord(text);
  if (!word) return;

  const range = sel!.getRangeAt(0);
  const anchor = range.getBoundingClientRect();

  showNode(renderLoading(word), anchor);

  try {
    const msg: LookupMessage = { type: 'lookup', word };
    const data = (await chrome.runtime.sendMessage(msg)) as LookupResponse;
    showNode(renderPopup(data), anchor);
  } catch (e) {
    console.error('[pealim] messaging failed:', e);
    showNode(renderPopup({ error: `Lookup failed: ${(e as Error).message}`, code: 'UPSTREAM' }), anchor);
  }
});

document.addEventListener('mousedown', (e) => {
  if (host && e.target !== host) dismiss();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismiss();
});
```

- [ ] **Step 2: Typecheck + build**

Run: `cd extension && npm run typecheck && npm run build`
Expected: tsc clean; `dist/` produced with `manifest.json`, `service-worker`/background and content bundles, no errors.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Add content script with double-click trigger and shadow-DOM popup"
```

---

## Task 11: Local end-to-end verification & deploy notes (user-gated)

> Deployment and any command touching Cloudflare are **gated on explicit user approval** (user rule). This task documents the steps; the implementer runs the local-dev verification and then **asks the user** before any `wrangler deploy`.

**Files:**
- Modify: `extension/src/config.ts` (after deploy), `extension/manifest.json` (after deploy), `worker/wrangler.toml` (KV id)

- [ ] **Step 1: Run the full automated suite**

```bash
cd /Volumes/Annette/IdeaProjects/pealim/worker && npm run typecheck && npm test
cd /Volumes/Annette/IdeaProjects/pealim/extension && npm run typecheck && npm test && npm run build
```
Expected: all green; `extension/dist/` built.

- [ ] **Step 2: Start the Worker locally** (background)

```bash
cd /Volumes/Annette/IdeaProjects/pealim/worker && npm run dev
```
`wrangler dev` serves on `http://localhost:8787`. (KV in local dev is simulated; no namespace id needed for `wrangler dev`.)

- [ ] **Step 3: Smoke-test the Worker endpoint**

```bash
curl -s "http://localhost:8787/lookup?q=%D7%9C%D7%91%D7%A7%D7%A9" | head -c 400
```
Expected: JSON with `"isVerb":true` and a `conjugation` object.

- [ ] **Step 4: Load the extension unpacked** (manual — user performs in Chrome)

Confirm `extension/src/config.ts` `WORKER_URL` is `http://localhost:8787`. Then in Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked" → select `extension/dist`.

- [ ] **Step 5: Manual acceptance on a real page** (user confirms — do not claim success without it)

On any Hebrew page, double-click:
- a **verb** (e.g. לבקש) → popup shows lemma + translation + root + Pi'el matrix.
- a **non-verb** (e.g. מבוקש) → popup shows lemma + translation + root, no matrix.
- a nonsense Hebrew string → popup shows "No Pealim entry…".
- an English word → no popup appears.
Check `Esc` and outside-click dismiss, and RTL layout.

- [ ] **Step 6: Deploy (ONLY after explicit user "yes")**

```bash
cd /Volumes/Annette/IdeaProjects/pealim/worker
npm install -D wrangler@latest        # Step 0: latest wrangler (CF standard)
npx wrangler kv namespace create PEALIM_CACHE
# → copy the printed id into wrangler.toml [[kv_namespaces]] id
npx wrangler deploy
# → note the deployed https://pealim-lookup.<subdomain>.workers.dev URL
```
Then update `extension/src/config.ts` `WORKER_URL` and `extension/manifest.json` `host_permissions` to the deployed URL, rebuild (`npm run build`), and reload the unpacked extension.

- [ ] **Step 7: Commit deploy config**

```bash
cd /Volumes/Annette/IdeaProjects/pealim
git add .
git commit -m "Wire extension to deployed worker URL"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §2 trigger/RTL/dismiss → Task 10; adaptive popup → Task 7; §3.1 Worker+KV → Tasks 4–5; §3.2 content → Task 10; §3.3 background+storage → Task 9; §4 parser contract → Tasks 2–3; §5 data shape → Task 1 types + Tasks 2–5; §6 error handling → Tasks 4,9,10 (structured errors + console + popup); §7 caching → Task 4 (KV) + Task 9 (storage); §10 testing → fixture unit tests (Tasks 2–5,7,8) + manual (Task 11). §8 decisions encoded in Global Constraints. §12 roadmap intentionally out of scope.
- **Placeholder scan:** no TBD/TODO; all code steps contain full code; deploy-time `id`/URL placeholders are explicit, single-source, and replaced in Task 11.
- **Type consistency:** `LookupResult`/`LookupError`/`Conjugation`/`SearchResult` defined in Task 1, reused verbatim; extension mirror in Task 6 matches field-for-field; function names (`parseSearchResults`, `parseDictPage`, `normalizeQuery`, `lookup`, `isError`, `containsHebrew`, `extractWord`, `renderPopup`, `renderLoading`, `computePosition`, `cacheKeyFor`) are consistent across consuming tasks. Conjugation key sets (past has `3p` only; future has `3mp`+`3fp`) are identical in types, parser, and popup.
```
