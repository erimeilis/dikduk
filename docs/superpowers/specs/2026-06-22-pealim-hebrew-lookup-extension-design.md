# Pealim Hebrew Lookup — Design Spec

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan

## 1. Purpose

A Chrome extension (Manifest V3) that lets a reader double-click any Hebrew word on
any web page and get an instant compact popup with:

- **Translation** (English) + **root**, for any word.
- For **verbs**, additionally the **Active-forms conjugation matrix** (Hebrew-only cells,
  primary table only).

Data is sourced from [pealim.com](https://www.pealim.com/). A Cloudflare Worker fetches and
parses Pealim's HTML into clean JSON and caches it; the extension calls the Worker.

## 2. User experience

- **Trigger:** double-click a word. The browser's own word-boundary selection handles
  Hebrew segmentation. The listener fires only when the selected text contains Hebrew
  letters (Unicode range U+0590–U+05FF); non-Hebrew double-clicks are ignored.
- **Popup:** appears next to the selected word, viewport-aware (never clipped off-screen),
  rendered right-to-left for Hebrew. Dismissed by clicking outside or pressing `Esc`.
- **Adaptive content (superset):** the popup always shows word + translation + root at the
  top. If the entry is a verb, the compact conjugation matrix is appended below.
- **Scope:** active on all sites (`<all_urls>`).

### Popup layout

Non-verb (e.g. the adjective מְבוּקָּשׁ):

```
┌─────────────────────────────┐
│ מְבוּקָּשׁ                       │
│ wanted, required, desired   │
│ root ב־ק־שׁ                  │
└─────────────────────────────┘
```

Verb (e.g. לְבַקֵּשׁ, Binyan Pi'el) — header + Hebrew-only matrix. 1st-person and
infinitive rows span genders exactly as Pealim renders them:

```
┌─────────────────────────────────────────────────┐
│    לְבַקֵּשׁ   to ask, request   root ב־ק־שׁ   Pi'el  │
│                Singular           Plural        │
│                  M      F          M      F     │
│ Present       מְבַקֵּשׁ  מְבַקֶּשֶׁת     מְבַקְשִׁים מְבַקְשׁוֹת     │
│ Past · 1st    בִּקַּשְׁתִּי (span)      בִּקַּשְׁנוּ (span)    │
│ Past · 2nd    בִּקַּשְׁתָּ  בִּקַּשְׁתְּ       בִּקַּשְׁתֶּם בִּקַּשְׁתֶּן      │
│ Past · 3rd    בִּקֵּשׁ       בִּקְּשָׁה   בִּקְּשׁוּ (span)      │
│ Future · 1st  אֲבַקֵּשׁ (span)       נְבַקֵּשׁ (span)     │
│ Future · 2nd  תְּבַקֵּשׁ  תְּבַקְשִׁי     תְּבַקְשׁוּ תְּבַקֵּשְׁנָה      │
│ Future · 3rd  יְבַקֵּשׁ  תְּבַקֵּשׁ      יְבַקְשׁוּ תְּבַקֵּשְׁנָה      │
│ Imperative    בַּקֵּשׁ   בַּקְשִׁי      בַּקְשׁוּ  בַּקֵּשְׁנָה       │
│ Infinitive    לְבַקֵּשׁ (span)                       │
│                                      source ↗   │
└─────────────────────────────────────────────────┘
```

## 3. Architecture

Three independently testable units.

### 3.1 Cloudflare Worker — `worker/`

The data pipeline. Single endpoint:

```
GET /lookup?q=<hebrew word>  →  application/json
```

Flow:

1. Normalize `q`; look up in **KV** cache. On hit, return cached JSON.
2. On miss, fetch `https://www.pealim.com/search/?q=<q>` with a browser-like
   `User-Agent`.
3. Parse the **first** `.verb-search-result` block (Pealim ranks the best match first):
   - lemma — `.verb-search-lemma` (vocalized Hebrew) + its `/dict/<id>-<slug>/` href
   - root — `.verb-search-root`
   - translation — `.verb-search-meaning`
   - binyan / part-of-speech — `.verb-search-binyan`
   - `isVerb` — true when the result links to "View full conjugation" / exposes a verb
     binyan; false for "View all forms" (nouns/adjectives).
4. If `isVerb`, fetch the dict page and parse the **Active forms** table (the first
   `table.conjugation-table`, under the `<h3>Active forms …</h3>` header). Read cells by
   their stable coordinate IDs (see §4). Ignore the Passive-forms table.
5. Assemble JSON (§5), write to KV with a long TTL (dictionary data is effectively static;
   default 30 days), return with permissive CORS headers.

**Parsing:** Cloudflare **HTMLRewriter** (streaming, no DOM library). Each page type
(search results, dict page) has its own rewriter handler set.

**Resilience / honesty:** non-2xx from Pealim, empty results, or missing expected nodes
each produce a structured error response (`{ "error": "...", "code": "..." }`) — never a
silent empty success.

### 3.2 Extension content script — `extension/content/`

- Registered on `<all_urls>`, runs at `document_idle`.
- Listens for `dblclick`; reads `window.getSelection()`; aborts unless the text contains a
  Hebrew letter.
- Sends the trimmed word to the background worker via `chrome.runtime.sendMessage`.
- Renders the popup (Shadow DOM to isolate styles from the host page), positions it relative
  to the selection rect, handles outside-click / `Esc` dismissal, RTL layout.
- Surfaces loading, empty, and error states in the popup.

### 3.3 Extension background service worker — `extension/background/`

- Receives lookup messages, checks a small `chrome.storage.local` cache (per-device,
  avoids re-hitting the network for repeats), else `fetch`es the Cloudflare Worker.
- The cross-origin call to the Worker is allowed via the Worker's CORS headers and the
  extension's host permission for the Worker origin.
- Returns the JSON (or a structured error) to the content script. Caches successful results.

## 4. Pealim HTML — verified facts (parser contract)

Grounded by inspecting live pages on 2026-06-22 (`/dict/255-levakesh/`,
`/search/?q=לבקש`, the mevukash search). Saved as test fixtures.

**Search results page** — container `.verb-search-result`, with children
`.verb-search-lemma` (→ `/dict/<id>-<slug>/`), `.verb-search-root`, `.verb-search-meaning`,
`.verb-search-binyan`, `.verb-search-button` ("View full conjugation" = verb / "View all
forms" = non-verb).

**Dict page conjugation cells** — `table.conjugation-table` containing `td.conj-td` cells.
Each relevant cell wraps `<div id="<COORD>">` with a `<span class="menukad">` holding the
vocalized Hebrew form (plus `.transcription` and `.meaning` we deliberately drop). Active
forms appear under `<h3 class="page-header">Active forms <span class="small">Binyan
…</span></h3>`; passive under `Passive forms`.

**Coordinate ID map** (Active forms table):

| Tense        | IDs                                                                 |
|--------------|---------------------------------------------------------------------|
| Present (AP) | `AP-ms`, `AP-fs`, `AP-mp`, `AP-fp`                                   |
| Past (PERF)  | `PERF-1s`, `PERF-1p`, `PERF-2ms`, `PERF-2fs`, `PERF-2mp`, `PERF-2fp`, `PERF-3ms`, `PERF-3fs`, `PERF-3p` |
| Future (IMPF)| `IMPF-1s`, `IMPF-1p`, `IMPF-2ms`, `IMPF-2fs`, `IMPF-2mp`, `IMPF-2fp`, `IMPF-3ms`, `IMPF-3fs`, `IMPF-3mp`, `IMPF-3fp` |
| Imperative   | `IMP-2ms`, `IMP-2fs`, `IMP-2mp`, `IMP-2fp`                           |
| Infinitive   | `INF-L`                                                             |

Note the merged/spanning cells: Past & Future 1st person use a single `*-1s` / `*-1p`
(no gender split); Past 3rd plural is a single `PERF-3p`; infinitive is single `INF-L`.
Root is rendered in a `Root:` line with a `.menukad` span; binyan in the Active-forms header.

## 5. Data shape (Worker → extension)

```jsonc
{
  "word": "מְבַקֵּשׁ",          // the form the user looked up (lemma if resolved)
  "lemma": "לְבַקֵּשׁ",         // canonical dictionary form
  "translation": "to ask, to request",
  "root": "ב־ק־שׁ",
  "isVerb": true,
  "binyan": "Pi'el",          // present only when isVerb
  "conjugation": {            // present only when isVerb
    "present":    { "ms": "...", "fs": "...", "mp": "...", "fp": "..." },
    "past":       { "1s": "...", "1p": "...", "2ms": "...", "2fs": "...",
                    "2mp": "...", "2fp": "...", "3ms": "...", "3fs": "...", "3p": "..." },
    "future":     { "1s": "...", "1p": "...", "2ms": "...", "2fs": "...",
                    "2mp": "...", "2fp": "...", "3ms": "...", "3fs": "...",
                    "3mp": "...", "3fp": "..." },
    "imperative": { "2ms": "...", "2fs": "...", "2mp": "...", "2fp": "..." },
    "infinitive": "לְבַקֵּשׁ"
  },
  "sourceUrl": "https://www.pealim.com/dict/255-levakesh/"
}
```

For non-verbs: `isVerb: false`, and `binyan` / `conjugation` are omitted.

Error shape: `{ "error": "<human message>", "code": "NO_RESULTS" | "UPSTREAM" | "PARSE" }`.

## 6. Error handling (No Silent Failures)

Every failure path logs to console with context **and** surfaces a message in the popup:

- No Pealim entry → "No Pealim entry for «word»".
- Worker/network failure → "Lookup failed: <message>".
- Parse failure (HTML structure changed) → "Couldn't read Pealim's page".

No empty `catch`; no generic swallowed errors.

## 7. Caching

- **Worker KV:** key = normalized query, value = result JSON, TTL ~30 days. Dictionary data
  is static; long TTL minimizes load on Pealim and latency.
- **Extension `chrome.storage.local`:** small per-device cache of recent successful lookups,
  to avoid a network round-trip on repeats.

## 8. Scope & decisions (YAGNI)

- **Top match only** for v1 — no disambiguation list when Pealim returns several entries.
- **Primary (Active forms) table only** — passive/other tables excluded.
- **Hebrew-only cells** — transliteration and per-cell English glosses dropped; niqqud kept.
- **Manifest V3**, vanilla **TypeScript** + **Vite** (extension and Worker), no UI framework.
- Polite scraping: browser-like User-Agent, aggressive caching, no parallel hammering.

## 9. Project structure

```
pealim/
├── extension/
│   ├── manifest.json
│   ├── background/        # service worker: messaging + Worker fetch + storage cache
│   ├── content/           # dblclick listener + Shadow-DOM popup (RTL)
│   └── vite.config.ts
├── worker/
│   ├── src/               # /lookup handler, search parser, dict parser, KV cache
│   ├── wrangler.toml
│   └── test/              # parser unit tests against fixtures
├── fixtures/              # saved Pealim HTML (levakesh dict, search pages)
└── docs/superpowers/specs/
```

## 10. Testing

- **Worker parser:** unit tests run the search-page and dict-page parsers against the saved
  HTML fixtures and assert the exact JSON output (verb `levakesh`, adjective `mevukash`).
  No live network in tests.
- **Worker endpoint:** integration test with a mocked `fetch` to Pealim returning fixtures.
- **Extension:** manual load-unpacked verification on a real Hebrew page. Correctness is
  confirmed by the user observing the popup — not claimed without that confirmation.

## 11. Out of scope (v1)

- Disambiguation between multiple Pealim matches.
- Passive / secondary conjugation tables.
- Audio playback, transliteration, per-cell glosses.
- Firefox/Safari ports, options UI, dark-mode theming beyond basic legibility.
- Image OCR and typing assist — roadmapped as separate phases (§12).

## 12. Roadmap (future phases — separate specs)

These are intentionally **not** in v1. Each gets its own brainstorm → spec → plan → build
cycle. Recorded here so the v1 architecture stays compatible.

### Phase 2 — Image OCR

Goal: look up a Hebrew word that lives inside a raster image (not selectable text).

- **Interaction:** double-click can't target a word in an image, so OCR needs its own
  trigger — right-click an image → "OCR & look up" → extract Hebrew text → present detected
  words as chips → user picks one → **reuse the existing `/lookup` pipeline unchanged**.
- **Engine (decided in the Phase 2 spec):** Tesseract.js with the Hebrew model (in-browser,
  free, accuracy on small/vocalized web Hebrew is mediocre) **vs** cloud OCR via the Worker
  (e.g. Google Vision — better accuracy, costs money + API key, sends images off-device).
- **v1 compatibility:** the `/lookup` endpoint and parsers are already engine-agnostic about
  *how* the query word was obtained, so no v1 changes are needed to enable this.

### Phase 3 — Typing assist (spell-flag)

Goal: while typing Hebrew into a field, flag words that appear to be mistyped.

- **Scope floor:** spelling only ("point at mistypes"). Full grammar/agreement checking is
  explicitly excluded — research-grade, not in scope.
- **Oracle:** **not Pealim.** Pealim is verb/dictionary-focused, so "absent from Pealim"
  produces false positives for ordinary nouns/names. Requires a real Hebrew word list
  (e.g. a Hunspell `he_IL` dictionary) plus edit-distance for suggestions.
- **Mechanism:** a separate content-script subsystem that monitors `input` / `textarea` /
  `contenteditable`, debounces, and renders an underline overlay — the Grammarly pattern.
  Architecturally independent of the lookup feature; clicking a flagged word may optionally
  open the same lookup popup.
```
