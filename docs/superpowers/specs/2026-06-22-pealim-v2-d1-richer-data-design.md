# Pealim v2 — D1 Mirror + Richer Data + Accordion Popup — Design Spec

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan
**Extends:** the shipped v1 lookup (`docs/superpowers/specs/2026-06-22-pealim-hebrew-lookup-extension-design.md`). This is a breaking change to the v1 JSON contract (not yet released).

## 1. Purpose & scope

Evolve the lookup from an opportunistic KV cache into a durable, relational data layer, and capture/show more of each Pealim entry.

**In scope (this pass):**
- **Tiered storage:** KV (fast, TTL'd edge cache) → D1 (permanent mirror) → Pealim (origin).
- **Richer parsing:** active forms **+ passive forms + "See also" references**.
- **Relational schema** in D1 (`entries` / `aliases` / `see_also`) modeling references as FKs.
- **Accordion popup:** header + Active (default) + Passive (if present) + See also (if present).
- **Context-menu trigger:** a single "Look up in Pealim" item, so lookups work on links (double-click does not select words inside `<a>`).

**Explicitly deferred (each its own later spec):**
- **See-also reference crawler** — a background job that follows references to fetch+store target entries (rate-limiting, queue/cron, depth/visited tracking). References fill in organically until then.
- **Per-user stats + "words of the day"** (likely a `userId → word` D1 table, TBD).
- **Full-dictionary seeder** (verified feasible: ~10K entries / ~20 MB, within D1 free limits; cost is a polite ~10K-page crawl).
- **Audio pronunciations via R2.**
- **Fallback source for Pealim-misses.** Pealim is curated/verb-focused (~9.1K entries: near-exhaustive on verbs, not-exhaustive on nouns/adjectives), whereas Modern Hebrew has ~70–100K words — so a reader will regularly hit nouns/names/technical/slang terms Pealim lacks. Pealim stays the **primary** source (unmatched conjugation data); a future phase can add a tier so a Pealim `NO_RESULTS` falls through to a fallback (`KV → D1 → Pealim → fallback`). Candidate fallbacks: **Wiktionary** (open/CC, broad definitions, but scrape-only via Wikimedia REST / `wiktextract`; thin root data), a Hebrew morphology API (e.g. HebrewNLP) for root/lemma, or a translation API for meaning. Decide once real coverage gaps are observed.

## 2. Architecture — tiered storage

The extension is unchanged in how it calls the Worker (`GET /lookup?q=…`). The Worker gains a D1 binding alongside the existing KV binding.

`lookup(query)` flow:
1. Normalize `query`.
2. **KV** `get(query)` → hit (not expired) → return. *(fast edge path)*
3. KV miss/expired → **D1**: resolve `query` via `aliases` → `entries` → hit → re-populate KV (TTL) → return. *(durable path; this is the Pealim-outage resilience — any previously-seen word survives)*
4. D1 miss → **fetch + parse Pealim** (search [+ dict page]) → assemble `LookupResult` → **write D1** (`entries` upsert by slug + `aliases` row + `see_also` rows; permanent) **and** write KV (TTL) → return.
5. Pealim unreachable on a true miss → structured `{ error, code: 'UPSTREAM' }` (nothing stored for a never-seen word).

Immutability note: Pealim dictionary data never changes, so KV's TTL is only working-set hygiene (keeps KV small + reads fast); **D1 is the permanent source of truth**.

**No Silent Failures across tiers:** a KV read error logs + falls through to D1; a D1 read error logs + falls through to Pealim; KV/D1 write errors log + still return the result. No swallowed errors.

## 3. D1 schema (`worker/migrations/0001_init.sql`)

```sql
CREATE TABLE entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,   -- Pealim dict slug, e.g. "255-levakesh" (from /dict/<slug>/)
  lemma       TEXT NOT NULL,
  root        TEXT,
  translation TEXT NOT NULL,
  is_verb     INTEGER NOT NULL,       -- 0/1
  binyan      TEXT,                   -- active binyan (for future stats GROUP BY)
  data        TEXT NOT NULL,          -- full LookupResult JSON the extension renders
  source_url  TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL        -- Date.now()
);

CREATE TABLE aliases (
  query_key  TEXT PRIMARY KEY,        -- normalized lookup query (incl. inflected forms + the lemma)
  entry_id   INTEGER NOT NULL REFERENCES entries(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE see_also (
  from_id  INTEGER NOT NULL REFERENCES entries(id),
  to_slug  TEXT NOT NULL,             -- target entry's slug (known from the link immediately)
  to_id    INTEGER REFERENCES entries(id),  -- resolved FK once the target entry exists (NULL until then)
  label    TEXT NOT NULL,             -- the Hebrew label shown in the link
  PRIMARY KEY (from_id, to_slug)
);

CREATE INDEX idx_entries_lemma ON entries(lemma);
CREATE INDEX idx_entries_root  ON entries(root);
CREATE INDEX idx_see_also_to_slug ON see_also(to_slug);
```

Why three tables: `entries` is unique per Pealim entry (slug) so references are real FKs; `aliases` maps every inflected query to its entry without duplicating entry data (and gives a clean basis for future "distinct words" stats); `see_also` is the reference graph — `to_id` resolves to a FK once the target is crawled (organically now, by the crawler later), with `to_slug` holding the pointer in the meantime.

**Write-through on a Pealim fetch:** upsert the `entries` row by `slug` (`INSERT … ON CONFLICT(slug) DO UPDATE`), insert/ignore the `aliases` row (query → entry), insert/ignore `see_also` rows, and best-effort backfill `to_id` for any existing `see_also` rows whose `to_slug` matches this newly-stored slug.

## 4. Parsing additions

- **`dict-parser`** now returns active forms, passive forms, and see-also references:
  - **Active forms** — as today, cells `AP-*`/`PERF-*`/`IMPF-*`/`IMP-*`/`INF-L`, binyan from the "Active forms" header (or, for Qal, from the search page — see v1).
  - **Passive forms** — the same coordinate grid but cells are prefixed `passive-` (e.g. `passive-AP-ms`); binyan from the "Passive forms" header. Present only when the page has a passive table (verified: levakesh has Pu'al; leechol/Qal does not).
  - **See also** — under `<h3 class="page-header">See also</h3>`, each link `<a href="/dict/<slug>/">label</a>` → `{ label, slug }`. References only; **not crawled** in this spec.
- **`search-parser`** unchanged (lemma, root, translation, isVerb, binyan, dictUrl). The **slug** is derived from `dictUrl` (`/dict/<slug>/`).

## 5. Contract (`LookupResult`, v2)

```jsonc
{
  "word": "מבקשים",            // normalized query the user looked up
  "lemma": "לְבַקֵּשׁ",
  "slug": "255-levakesh",
  "root": "ב־ק־שׁ",
  "translation": "to ask, to request, to seek",
  "isVerb": true,
  "voices": {
    "active":  { "binyan": "Pi'el", "forms": { /* Conjugation */ } },
    "passive": { "binyan": "Pu'al", "forms": { /* Conjugation */ } }   // omitted if absent
  },
  "seeAlso": [ { "label": "בַּקָּשָׁה", "slug": "9876-bakasha" } ],         // [] if none
  "sourceUrl": "https://www.pealim.com/dict/255-levakesh/"
}
```
- Replaces v1's flat `conjugation` + top-level `binyan` with `voices.{active,passive}` (each `{ binyan, forms }`).
- `Conjugation` shape is unchanged from v1 (present/past/future/imperative/infinitive, with the `past.3p` / `future.3mp`+`3fp` asymmetry).
- Non-verbs: `voices` is omitted entirely (not `{}`); `seeAlso` may still be present.
- Error shape unchanged: `{ error, code: 'NO_RESULTS' | 'UPSTREAM' | 'PARSE' }`.

## 6. Popup — accordion

One popup component, opened by both triggers. RTL, solid background (the v1 `display:block` card).

```
┌─────────────────────────────────────────────────┐
│ לְבַקֵּשׁ   to ask, request        │   header — always
│ root ב־ק־שׁ                                      │
│ ▼ Active · Pi'el                                │   section, expanded by default (verbs)
│    [ Hebrew-only active matrix ]                │
│ ▸ Passive · Pu'al                               │   section — ONLY if voices.passive exists
│ ▸ See also (1)                                  │   section — ONLY if seeAlso.length > 0
│                                        Pealim ↗ │
└─────────────────────────────────────────────────┘
```

- **Header:** lemma + translation + `root …` — always.
- **Active section:** present when `voices.active` exists; the Hebrew-only conjugation matrix (v1 layout); **expanded by default**.
- **Passive section:** present only when `voices.passive` exists; same matrix layout from `voices.passive.forms`; collapsed by default.
- **See also section:** present only when `seeAlso` is non-empty; a list of the labels as links to `https://www.pealim.com/dict/<slug>/`; collapsed by default. (Clicking a see-also link opens Pealim in a new tab in this spec; in-extension navigation to the referenced entry is a future enhancement.)
- **Sections never render when their data is absent** — this is how "don't show empty options" is satisfied. A plain noun shows only the header (+ See also if present).
- `renderPopup(data)` builds the whole accordion from `data`; section headers toggle expand/collapse on click. Links hardened to `^https?://` (v1 XSS guard).

## 7. Triggers

- **Double-click** (unchanged behavior): select Hebrew word → open the accordion popup (Active expanded).
- **Context menu** (new): a single item `Look up "%s" in Pealim`, `contexts: ['selection']`. Requires the `contextMenus` permission. Background `onClicked` → `extractWord(info.selectionText)` → if not Hebrew, render a friendly "Select a Hebrew word" popup; else `fetchLookup(word)` → `chrome.tabs.sendMessage(tabId, { type: 'render', data })`. Content script listens for `{ type: 'render', data }` and shows the popup anchored at the current selection rect (fallback: the last right-click position).

## 8. Components touched

- **Worker:** `wrangler.toml` (+`[[d1_databases]]` binding + migration npm scripts per Cloudflare standards), `migrations/0001_init.sql`, `lookup.ts` (tiered KV→D1→Pealim store + write-through + assemble `voices`/`seeAlso`), `dict-parser.ts` (passive + see-also + slug helper), `types.ts` (v2 contract). A small `store.ts` (D1-backed `Store` with `get/put` + the upsert/alias/see_also logic), keeping `lookup.ts` orchestration clean.
- **Extension:** `types.ts` (v2 contract), `popup.ts` (accordion with conditional sections), `content.ts` (`render` message handler + last-pointer tracking), `background.ts` (context menu create + onClicked), `manifest.json` (+`contextMenus` permission).

## 9. Error handling (No Silent Failures)

Every tier and parse path logs with context AND returns/render a structured result: KV/D1 read errors degrade to the next tier; write errors log + still return; a parser throw or a degenerate (empty) conjugation → `{ code: 'PARSE' }`; Pealim non-2xx/throw → `{ code: 'UPSTREAM' }`; no results → `{ code: 'NO_RESULTS' }`. Context-menu delivery failures log. No empty catch blocks.

## 10. Testing

- **Parsers:** extend `dict-parser` tests against the `dict-levakesh` fixture to assert passive forms (`voices.passive`, binyan "Pu'al") and see-also references (label + slug). Confirm a Qal fixture (`dict-leechol`) yields no passive and (if applicable) its see-also.
- **Lookup orchestration:** in-memory fakes for KV + D1 (`Store`) + `fetch`. Assert tier order (KV hit short-circuits; KV miss → D1 hit re-populates KV, no fetch; D1 miss → fetch → writes both); **resilience** (D1 hit when `fetch` throws → returns stored entry, no Pealim call); write-through populates `entries`/`aliases`/`see_also`.
- **Popup:** accordion renders Active-only (noun → header only), Active+Passive, See-also; absent sections are not in the DOM; section toggle expands/collapses.
- **Context menu / messaging:** Chrome-API parts verified manually (load unpacked); pure helpers unit-tested.

## 11. Migration / rollout

D1 schema applied via `wrangler d1 migrations apply` (local + prod scripts). No data migration needed (KV is a cache; D1 starts empty and fills organically). The extension build is unchanged in wiring; only the contract/popup change. Local end-to-end verified with `wrangler dev` (local D1) before any deploy; deploy is user-gated.
