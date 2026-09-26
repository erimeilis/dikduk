# Architecture

How DikDuk is built and how it works internally. For build, test, and deploy
instructions see the package READMEs ([extension](../extension/README.md),
[worker](../worker/README.md)); for the public API surface see the
[worker README endpoints](../worker/README.md#endpoints). This document covers
the internals behind those.

DikDuk has two halves:

- **`extension/`** — a Chrome MV3 extension (TypeScript, Vite, `@crxjs/vite-plugin`).
  The user-facing product.
- **`worker/`** — a Cloudflare Worker HTTP API (TypeScript, Wrangler). A small,
  public, unauthenticated backend the extension calls.

Spell-check runs entirely in the browser. Only dictionary lookups and grammar
analysis reach the Worker.

```
┌──────────────────────── extension/ (Chrome MV3) ──────────────────────────┐
│  content.ts (isolated world)      highlight-main.ts (MAIN world)          │
│    double-click lookup              CSS Custom Highlight underlines       │
│    spell + grammar flags                                                  │
│         │                                                                 │
│         ▼                                                                 │
│  background.ts (service worker) ──► offscreen.ts (OCR + local spell)      │
│    message router, context menus                                          │
└─────────┬─────────────────────────────────────────────────────────────────┘
          │  GET /lookup?q=…            POST /analyze
          ▼
┌──────────────────────── worker/ (Cloudflare Worker) ──────────────────────┐
│  index.ts  fetch: /lookup, /analyze   scheduled: daily model refresh      │
│    lookup/   → KV → D1 → Pealim        analyze/ → provider + rules        │
│    storage/  → D1                       dynamic Workers-AI model list     │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Extension

### Execution contexts

The extension runs code in several isolated contexts that communicate by
message passing and DOM `CustomEvent`s:

| Context | File | Role |
|---------|------|------|
| Content script (isolated world) | `src/content.ts` | Double-click lookup, spell/grammar flag interactions, popups |
| Content script (MAIN world) | `src/spellcheck/highlight-main.ts` | Underlines flags via the CSS Custom Highlight API without touching the page's text nodes (it adds one `<style>` and tags each checked host with a `data-dikduk-field` id) |
| Service worker | `src/background.ts` | Message router + context menus (`src/messaging/`) |
| Offscreen document | `src/offscreen.ts` | Runs the OCR engine and the local spell engine |
| Toolbar popup | `src/action-popup.ts` | Toggles spell-check on/off |

Two content scripts run per page because the CSS Custom Highlight API is only
reachable from the page's MAIN world, while lookup and interaction logic live in
the isolated world for safety.

### Dictionary lookup

Double-clicking a Hebrew word (or a right-click "Look up" on a selection, or OCR
on an image) resolves a word to a popup. `content.ts` extracts the word, the
background router forwards the request, and the Worker's `GET /lookup` returns a
normalized entry that `src/lookup/` renders as a popup with translation, root,
part of speech, and conjugation/inflection tables. Lookup responses are cached
client-side as well.

### Spell-check and grammar (the flag pipeline)

Spell-check is local; grammar analysis is networked. Both surface as underlines
("flags") on the same fields, and they are **decoupled** so the slow one never
blocks the fast one:

1. **`src/spellcheck/engagement.ts`** owns the `input` and `focusin` listeners.
   On `input` it clears the field's flags immediately, then debounces a scan
   (`DEBOUNCE_MS = 500`); `focusin` only schedules a scan, so existing flags stay
   until fresh results replace them. It does *not* clear flags on `focusout` —
   flags stay visible after the field loses focus.
2. **`src/spellcheck/controller.ts`** runs two independent flows per scan, each
   with its own staleness guard (before painting it checks that this is still
   the field's latest scan and that the field text is unchanged):
   - **Spell** — sends normalized tokens to the offscreen Hspell engine
     (`src/spellcheck/engine-host.ts`, `engine.ts`), which loads `he.aff` /
     `he.dic` and runs in the browser with no network request. Paints as soon as
     it returns.
   - **Grammar** — calls the Worker's `POST /analyze` (`transport.ts`), then
     paints when it returns. Grammar issues that overlap a spell flag are
     suppressed so the two never double-underline the same span.
3. **`src/spellcheck/flag-store.ts`** holds the per-field spell and grammar
   flags (used for click hit-testing) and owns the overlay renderers.
4. Rendering: for `input`/`textarea`, `src/spellcheck/overlay-renderer.ts` draws
   a positioned overlay that follows the field (its scroll, scrolling ancestors,
   resizes) and removes itself when the field leaves the DOM; for
   `contenteditable`, `controller.ts` dispatches a `dikduk-spell-flags` event
   naming the field by id, and `highlight-main.ts` keeps per-field ranges and
   publishes their union as CSS Custom Highlights, so several fields can keep
   their flags at once. Clicking a flag opens suggestions (spell) or an explanation
   (grammar, `grammar-popup.ts`).

When grammar analysis fails or is paused (e.g. no models available, or the
monthly budget is reached), the controller dispatches a `dikduk-grammar-status`
event and `content.ts` shows a small non-blocking note instead of failing
silently.

### OCR

`src/ocr/` runs Tesseract.js in the offscreen document against
`public/tessdata/heb.traineddata.gz`, so right-clicking an image extracts Hebrew
words that aren't selectable, then feeds them through the normal lookup path.

---

## Worker

`src/index.ts` is the entry point. Its `fetch` handler routes `GET /lookup` and
`POST /analyze`; its `scheduled` handler runs the daily model-catalogue refresh
(cron below). CORS is wildcard because the API is public and called from
arbitrary pages.

### Dictionary lookup — tiered resolution

`src/lookup/` resolves a query in order, returning the first hit and backfilling
the faster tiers:

1. **KV cache** (`PEALIM_CACHE`) — key `lookup:v3:${q}`, 30-day TTL (`TTL = 2592000`).
2. **D1 store** (`src/storage/d1-store.ts`, `pealim` database).
3. **Pealim** — fetched and parsed live (`search-parser.ts`, `dict-parser.ts`),
   then written back to D1 and KV.

`src/lookup/normalize.ts` strips niqqud (vowel points) from the query so that
unvowelled input matches vowelled entries — the same normalization is applied on
the write path, so cache keys line up.

### Grammar analysis — providers, rules, dynamic models

`POST /analyze` (`src/analyze/index.ts`) selects a provider. Three exist:

| Provider | Module | Notes |
|----------|--------|-------|
| `dictabert-http` | `providers/dictabert-http.ts` | Default when configured; a local DictaBERT sidecar (`scripts/dictabert-analyzer.py`) that returns morphology + dependency parse |
| `workers-ai` | `providers/workers-ai.ts` | Cloudflare Workers AI, via a dynamically-selected model list (below) |
| `gemini` | `providers/gemini.ts` | Google Gemini, server-side key only |

For the DictaBERT path, an orchestrator applies a deterministic **rule layer**
(`analyze/rules/`) over the analyzer's tokens — repeated adjacent words (surface
text), adjective–noun agreement, subject–verb agreement, and verb coordination
(morphology/dependency features) — followed by enrichment
(`analyze/enrichment.ts`). There is no hardcoded Hebrew lexicon.

### Dynamic Workers-AI model selection

The `workers-ai` provider does not hardcode model IDs (they get deprecated and
disabled). Instead:

- **`analyze/catalogue.ts`** parses Cloudflare's published Workers-AI pricing
  catalogue into a price-ordered list of text-generation models.
- **`analyze/refresh.ts`** runs on a **daily cron** (`wrangler.toml`
  `crons = ["0 6 * * *"]`, 06:00 UTC). It probes candidates cheapest-first with a
  real analyze-shaped call and writes the top working models to KV under
  `analyze:models:v1` (`analyze/model-registry.ts`).
- At request time, **`providers/workers-ai.ts`** reads that KV list and tries
  models cheapest-first, returning on the first success — so a disabled or
  unreachable model falls through without a redeploy.
- **`analyze/metering.ts`** enforces a soft monthly cost ceiling
  (`MONTHLY_BUDGET_USD = 5`). Spend accumulates in KV under
  `analyze:spend:${month}` (62-day TTL); the budget check fails open on KV error.
  When tripped, `/analyze` returns `code: BUDGET` (HTTP 200 — analysis is paused,
  not errored). An empty model list returns `code: NO_MODELS` (HTTP 503), which
  is what a freshly-deployed Worker returns until the cron first populates KV.

### Data stores

| Store | Binding | Contents |
|-------|---------|----------|
| D1 | `DB` | `pealim` database — tables `entries`, `aliases`, `see_also` (`migrations/0001_init.sql`) |
| KV | `PEALIM_CACHE` | Lookup cache (`lookup:v3:*`), the model registry (`analyze:models:v1`), the monthly spend counter (`analyze:spend:*`), and UI-label translations (`translate:v2:<model>:*`, no TTL) |
| Workers AI | `AI` | Inference for the `workers-ai` grammar provider and `/translate` |

### UI-label translation

`POST /translate` (`src/translate/`) turns a short Hebrew UI label into its
English label for the macOS companion. It runs
`@cf/meta/llama-3.3-70b-instruct-fp8-fast` with a fixed "translate this software
UI label" system prompt: in a 20-label probe of real Chrome strings it got 19
right, where the dedicated MT model `m2m100-1.2b` got about 8 (it translated
labels as prose — הגדרות → "settled"). Results are cached in KV forever; the key
includes the model id, so changing the model starts a fresh cache. Model calls
share the monthly budget with `/analyze` (a spent budget returns 200 `BUDGET`).

### Pealim warm-cache scraper

`scripts/scrape-pealim.ts` (`scripts/scrape-lib.ts`) is an operator tool that
pre-populates D1 by crawling Pealim's dictionary, so lookups hit the cache
instead of scraping live. It is a **non-commercial reference cache** built to
reduce load on Pealim, not to redistribute their data:

- Polite by default: one request every 10 seconds (`--delay`), an honest
  `User-Agent` that links back to the repository, and capped exponential backoff
  with retry (`MAX_RETRIES = 8`).
- Resumable: it checkpoints progress to a local file and only advances the
  checkpoint after a batch is durably written to D1, so a crash re-fetches at
  most one in-flight batch.
- Batched: entries are flushed to D1 in groups (`--batch`, default 25) via
  `wrangler d1 execute`.

Scraped entries land in D1 and then serve the lookup path (and backfill KV on
first read), identically to entries fetched live.

---

## macOS companion

`macos/` is a SwiftPM menu-bar app that translates the UI of any Mac app — the
part a Chrome extension cannot reach (Chrome's own menus, toolbar, dialogs).

- **`DikDukCore`** (unit-tested): `HebrewText` (same term rules as
  `extension/src/shared/hebrew.ts`), `WorkerClient` (`GET /lookup`,
  `POST /translate`, 8 s timeout, errors mapped from the worker's `code`), and
  `LookupCache` (5,000-entry LRU persisted to `~/Library/Caches/DikDuk/cache.json`).
- **`DikDukApp`**: `ModifierWatcher` polls the modifier state and pointer every
  50 ms; `AXReader` reads the element under the pointer via the Accessibility API
  (title → description → value → help, up to 3 parents, never secure fields) and
  sets `AXManualAccessibility` so Chromium exposes its web content;
  `PanelController` debounces 120 ms, then fetches the phrase translation and up to
  6 term lookups in parallel into a floating, click-through `NSPanel`;
  `ClickInterceptor` (a session event tap) swallows the ⌥+click that pins it.

---

## Data flow and privacy

- **Spell-check never leaves the browser** — it runs in the offscreen document
  against the bundled Hspell dictionary.
- **Dictionary lookups and grammar analysis** are the only requests that reach
  the Worker. Lookups carry a single word; grammar analysis carries the field
  text (capped at 2000 characters) and is only sent for fields with enough
  Hebrew to analyze.
- The **macOS companion** sends the Hebrew label under the pointer (at most 200
  characters) to `/translate` and its terms to `/lookup`, only while the trigger
  modifier is held. Password fields are never read.
- Provider API keys (Gemini) live server-side in the Worker, never in the
  extension.
