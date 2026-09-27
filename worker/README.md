# DikDuk — worker

**Cloudflare Worker HTTP API for Hebrew dictionary lookup, grammar analysis, and UI-label translation.**

Written in TypeScript and deployed with [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
It is the backend for the [DikDuk extension](../extension/README.md) and the
[macOS companion](../macos/README.md). The API is public and unauthenticated (CORS is wildcard) so
the extension can call it from any page.

---

## Endpoints

### Authentication (AI endpoints)

`/lookup` is open. `/translate` and `/analyze` spend AI, which the caller pays for:

| Headers | Who pays |
|---|---|
| `Authorization: Bearer <Google AI Studio key>` + `X-DikDuk-Provider: gemini` | the caller's Gemini account |
| `Authorization: Bearer <Cloudflare API token>` + `X-DikDuk-Provider: workers-ai` + `X-DikDuk-Account: <account id>` | the caller's Cloudflare account |
| `Authorization: Bearer <OWNER_TOKEN>` (no provider, or `X-DikDuk-Provider: owner`) | the Worker owner (metered on the monthly budget) |
| none | nobody: cached translations only, otherwise `200 {"code":"NEEDS_KEY"}` |

Secrets travel only in `Authorization`, never in a custom header. The provider name is
case-insensitive; without it, `Authorization` is treated as the owner token.

A rejected key returns `401 {"code":"BAD_KEY"}`; malformed headers `400 {"code":"BAD_REQUEST"}`. Keys are
used for that one request and never stored or logged. Credential headers are ignored on `/lookup`.

### `GET /lookup?q=<hebrew word>`

Looks up a Hebrew word and returns its dictionary entry: `lemma`, `translation`, `root`, `isVerb`,
`inflectionKind`, conjugation `voices` (for verbs) or `adjectiveForms`, `seeAlso` references, and the
`sourceUrl` on Pealim.

Resolution is tiered, returning the first hit:

1. **KV cache** (`PEALIM_CACHE`, 30-day TTL)
2. **D1 store** (`pealim` database)
3. **Pealim** — scraped from [pealim.com](https://www.pealim.com), then written back to D1 and KV

```bash
curl 'http://localhost:8787/lookup?q=לאכול'
```

Errors are returned as `{ "error": "...", "code": "..." }`:

| Code         | HTTP | Meaning                         |
|--------------|------|---------------------------------|
| `NO_RESULTS` | 404  | No matching entry / missing `q` |
| `PARSE`      | 502  | Could not parse the Pealim page |
| `UPSTREAM`   | 502  | Pealim request failed           |

### `POST /analyze`

Analyzes Hebrew text for grammar issues. Body: `{ "text": string, "provider"?: string, "model"?: string }`.
Returns `{ provider, model, text, tokens, issues, raw }`. `text` is capped at 2000 characters.

```bash
curl -X POST http://localhost:8787/analyze \
  -H 'content-type: application/json' \
  -d '{"text":"אני הולך לבית ספר"}'
```

Providers (selected via the `provider` field, else the default):

| Provider         | Requires                                   | Notes                        |
|------------------|--------------------------------------------|------------------------------|
| `dictabert-http` | `DICTABERT_ANALYZER_URL` (+ optional token)| **Default**; local sidecar   |
| `workers-ai`     | `AI` binding                               | Cloudflare Workers AI        |
| `gemini`         | `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`)| Google Gemini               |

| Code          | HTTP | Meaning                          |
|---------------|------|----------------------------------|
| `BAD_REQUEST` | 400  | Missing/invalid body or too long |
| `NO_PROVIDER` | 503  | No analysis provider configured  |
| `PARSE`       | 502  | Could not parse provider response|

### `POST /translate`

Translates a short Hebrew UI label (menu item, button, setting) to English — used by the macOS
companion. Body: `{ "text": string }`, at most 200 characters, must contain Hebrew. Returns
`{ "translation": string }`.

```bash
curl -X POST http://localhost:8787/translate \
  -H 'content-type: application/json' \
  -d '{"text":"הגדרות"}'
# {"translation":"Settings"}
```

Runs Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with a UI-label prompt. Results are cached
in KV **forever**, keyed by model + niqqud-free text, so a model change starts a fresh cache. Model
calls are metered against the same monthly budget as `/analyze`.

| Code          | HTTP | Meaning                                   |
|---------------|------|-------------------------------------------|
| `BAD_REQUEST` | 400  | Missing text, over 200 chars, or no Hebrew|
| `BUDGET`      | 200  | Monthly AI budget reached (paused)        |
| `UPSTREAM`    | 502  | Model call failed or returned no text     |

---

## Prerequisites

- Node.js and npm
- A Cloudflare account (for deploy) — `wrangler` is installed as a dev dependency
- For the default grammar provider: [`uv`](https://docs.astral.sh/uv/) to run the DictaBERT sidecar

---

## Develop

```bash
npm install
npm run dev              # wrangler dev on http://localhost:8787
```

To exercise grammar analysis locally with DictaBERT, run the Python sidecar and start the Worker with
its URL wired in:

```bash
npm run analyzer:dictabert   # serves the DictaBERT analyzer on 127.0.0.1:8788
npm run dev:analyze          # wrangler dev with DICTABERT_ANALYZER_URL set to the sidecar
```

The sidecar script is `scripts/dictabert-analyzer.py`.

---

## Scripts

| Script                       | Purpose                                             |
|------------------------------|-----------------------------------------------------|
| `npm run dev`                | `wrangler dev` (local)                              |
| `npm run dev:analyze`        | `wrangler dev` with the local DictaBERT analyzer    |
| `npm run analyzer:dictabert` | Run the DictaBERT Python sidecar via `uv`           |
| `npm run deploy`             | `wrangler deploy`                                   |
| `npm run typecheck`          | Type-check app and test configs                     |
| `npm run test`               | Run the Vitest suite                                |
| `npm run db:migrate:local`   | Apply D1 migrations locally                         |
| `npm run db:migrate:prod`    | Apply D1 migrations to the remote D1 database       |

---

## Bindings and configuration

Configured in `wrangler.toml`:

| Binding         | Type | Purpose                                  |
|-----------------|------|------------------------------------------|
| `PEALIM_CACHE`  | KV   | Lookup response cache (30-day TTL); `/translate` cache (no TTL) |
| `DB`            | D1   | `pealim` database (persisted lookups)    |
| `AI`            | AI   | Workers AI (`workers-ai` grammar provider, `/translate`)|

Secret `OWNER_TOKEN` (`wrangler secret put OWNER_TOKEN`) is the owner's access token for the AI endpoints;
without it owner access is disabled.

Optional environment variables / secrets for grammar providers: `DICTABERT_ANALYZER_URL`,
`DICTABERT_ANALYZER_TOKEN`, `GEMINI_API_KEY`, `GEMINI_MODEL`.

Database schema lives in `migrations/` (tables: `entries`, `aliases`, `see_also`).

---

## Project structure

```
worker/
├── wrangler.toml            # Worker config, KV/D1/AI bindings
├── migrations/              # D1 schema migrations
├── scripts/                 # DictaBERT Python analyzer sidecar
├── src/
│   ├── index.ts             # fetch handler: routes /lookup, /analyze, /translate
│   ├── lookup/              # Pealim search/dict parsing, tiered lookup
│   ├── analyze/             # grammar analysis: providers, rules, enrichment
│   ├── translate/           # UI-label translation (Workers AI, KV-cached forever)
│   ├── storage/             # D1 store
│   └── shared/              # fetch, HTML parse, Hebrew helpers
└── test/                    # Vitest tests + fixtures
```

---

## License

[GNU AGPL-3.0-or-later](../LICENSE). Dictionary data from [Pealim](https://www.pealim.com); see
[../NOTICE](../NOTICE).
