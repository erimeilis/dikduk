<div align="center">
  <img src="extension/public/icons/icon128.png" alt="DikDuk logo" width="96" />
</div>

# DikDuk

**Read and write Hebrew — in-page dictionary lookup, spell-check, and grammar hints in the browser,
plus hover translation of any Mac app's Hebrew interface.**

DikDuk (from Hebrew _dikduk_, דקדוק, "grammar") is a Chrome extension and a macOS menu-bar companion,
both backed by a Cloudflare Worker. Double-click a Hebrew word on any page to see its translation,
root, and full conjugation; get misspellings underlined as you type; receive grammar hints on Hebrew
text you write; and, with a Hebrew-language Mac, hold ⌥ over any menu, button, or setting to see
what it means.

Dictionary data comes from [Pealim](https://www.pealim.com); the spelling dictionary is derived from
the [Hspell](http://hspell.ivrix.org.il/) project.

**Repository:** <https://github.com/erimeilis/dikduk>

---

## Packages

| Path | What it is | Details |
| --- | --- | --- |
| `extension/` | Chrome MV3 extension (TypeScript) | [extension/README.md](extension/README.md) |
| `worker/` | Cloudflare Worker HTTP API (TypeScript) | [worker/README.md](worker/README.md) |
| `macos/` | macOS menu-bar companion (Swift) — hover translation of any app's UI | [macos/README.md](macos/README.md) |
| `docs/` | Architecture and design notes | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

The extension and the macOS companion are the user-facing products. The Worker is a small public API
they call for dictionary lookups, grammar analysis, and UI-label translation.

---

## Features

- **Dictionary lookup** — double-click a Hebrew word, or right-click a selection or image (OCR), to
  see translation, root, part of speech, and conjugation/inflection tables.
- **Spell-check** — Hebrew misspellings are underlined as you type in inputs, textareas, and
  `contenteditable` fields. Click a flag for suggestions, add-to-dictionary, or ignore. Runs locally
  from a bundled Hspell dictionary — no network request.
- **Grammar hints** — Hebrew text is analyzed by the Worker's `/analyze` endpoint and grammar issues
  are underlined; click one for an explanation and suggested fix.
- **Hover translation on macOS** — the companion app reads the Hebrew text under the pointer in any
  app (including Chrome's own menus, toolbar, and settings, which an extension cannot reach) while
  you hold ⌥, and shows its English meaning plus a Pealim breakdown of each term. ⌥+click pins the
  panel; click a term to open it on Pealim.

---

## Architecture

```
┌─────────────────────────── Chrome extension (extension/) ─────────────────────────┐
│  content script ──► background service worker ──► Cloudflare Worker (worker/)     │
│  (double-click,     (message router,              GET  /lookup?q=…  → Pealim      │
│   spell flags,       context menus,               POST /analyze     → grammar     │
│   grammar flags)     offscreen OCR + spell)       POST /translate   → UI labels   │
└──────────────────────────────────────────────────────────▲────────────────────────┘
┌──────────────────── macOS companion (macos/) ────────────┼────────────────────────┐
│  hold ⌥ ─► Accessibility API reads the element ─► /translate + /lookup ─► panel   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

- Spell-check is performed **locally** inside an offscreen document using the bundled Hspell
  dictionary; it never leaves the browser.
- Dictionary lookups, grammar analysis, and UI-label translation are the only calls that reach the
  Worker.
- The Worker scrapes and caches [Pealim](https://www.pealim.com) (KV + D1) for lookups, delegates
  grammar analysis to a configured provider (DictaBERT, Workers AI, or Gemini), and translates UI
  labels with Workers AI (cached in KV).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how each part is built and works internally.

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

**macOS companion** — download `DikDuk-macos-<version>.zip` from
[Releases](https://github.com/erimeilis/dikduk/releases) (see [macos/README.md](macos/README.md#download)),
or build it (Xcode command-line tools, Swift 6):

```bash
cd macos
scripts/bundle.sh  # builds and signs build/DikDuk.app
open build/DikDuk.app
```

Grant DikDuk access in System Settings › Privacy & Security › Accessibility on first launch.

See each package's README for full build, test, and deploy instructions.

---

## Development

The TypeScript packages use [Vitest](https://vitest.dev) for tests and `tsc` for type-checking; the
macOS companion uses Swift Testing:

```bash
# in extension/ or worker/
npm run typecheck
npm run test

# in macos/
swift test
```

---

## License

[GNU AGPL-3.0-or-later](LICENSE). See [NOTICE](NOTICE) for third-party attributions (Pealim data,
Hspell dictionary).
