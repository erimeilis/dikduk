<div align="center">
  <img src="extension/public/icons/icon128.png" alt="DikDuk logo" width="96" />
</div>

# DikDuk

**Read and write Hebrew in the browser — in-page dictionary lookup, spell-check, and grammar hints.**

DikDuk (from Hebrew _dikduk_, דקדוק, "grammar") is a Chrome extension backed by a Cloudflare Worker.
Double-click a Hebrew word on any page to see its translation, root, and full conjugation; get
misspellings underlined as you type; and receive grammar hints on Hebrew text you write.

Dictionary data comes from [Pealim](https://www.pealim.com); the spelling dictionary is derived from
the [Hspell](http://hspell.ivrix.org.il/) project.

**Repository:** <https://github.com/erimeilis/dikduk>

---

## Packages

| Path         | What it is                          | Details                          |
|--------------|-------------------------------------|----------------------------------|
| `extension/` | Chrome MV3 extension (TypeScript)   | [extension/README.md](extension/README.md) |
| `worker/`    | Cloudflare Worker HTTP API (TypeScript) | [worker/README.md](worker/README.md) |
| `docs/`      | Design and feature notes            | —                                |

The extension is the user-facing product. The Worker is a small public API that the extension calls
for dictionary lookups and grammar analysis.

---

## Features

- **Dictionary lookup** — double-click a Hebrew word, or right-click a selection or image (OCR), to
  see translation, root, part of speech, and conjugation/inflection tables.
- **Spell-check** — Hebrew misspellings are underlined as you type in inputs, textareas, and
  `contenteditable` fields. Click a flag for suggestions, add-to-dictionary, or ignore. Runs locally
  from a bundled Hspell dictionary — no network request.
- **Grammar hints** — Hebrew text is analyzed by the Worker's `/analyze` endpoint and grammar issues
  are underlined; click one for an explanation and suggested fix.

---

## Architecture

```
┌─────────────────────────── Chrome extension (extension/) ─────────────────────────┐
│  content script ──► background service worker ──► Cloudflare Worker (worker/)     │
│  (double-click,     (message router,              GET  /lookup?q=…  → Pealim      │
│   spell flags,       context menus,               POST /analyze     → grammar     │
│   grammar flags)     offscreen OCR + spell)                                       │
└───────────────────────────────────────────────────────────────────────────────────┘
```

- Spell-check is performed **locally** inside an offscreen document using the bundled Hspell
  dictionary; it never leaves the browser.
- Dictionary lookups and grammar analysis are the only calls that reach the Worker.
- The Worker scrapes and caches [Pealim](https://www.pealim.com) (KV + D1) for lookups, and delegates
  grammar analysis to a configured provider (DictaBERT, Workers AI, or Gemini).

---

## Quick start

Requires Node.js and npm. The Worker additionally uses [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
(installed as a dev dependency).

**Extension**

```bash
cd extension
npm install
npm run build      # outputs dist/ — load it as an unpacked extension in chrome://extensions
```

By default the extension talks to the deployed Worker. To use a local Worker, set `WORKER_URL` in
`extension/src/shared/config.ts` to `http://localhost:8787` and run the Worker locally (below).

**Worker**

```bash
cd worker
npm install
npm run dev        # wrangler dev on http://localhost:8787
```

See each package's README for full build, test, and deploy instructions.

---

## Development

Both packages use [Vitest](https://vitest.dev) for tests and `tsc` for type-checking:

```bash
# in extension/ or worker/
npm run typecheck
npm run test
```

---

## License

[GNU AGPL-3.0-or-later](LICENSE). See [NOTICE](NOTICE) for third-party attributions (Pealim data,
Hspell dictionary).
