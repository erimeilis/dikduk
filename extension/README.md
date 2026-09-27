<div align="center">
  <img src="public/icons/icon128.png" alt="DikDuk logo" width="96" />
</div>

# DikDuk — extension

**Chrome MV3 extension for reading and writing Hebrew: in-page dictionary lookup, spell-check, and grammar hints.**

Built with TypeScript, [Vite](https://vite.dev), and [`@crxjs/vite-plugin`](https://github.com/crxjs/chrome-extension-tools).
It calls the [DikDuk Worker](../worker/README.md) for dictionary lookups and grammar analysis; spell-check
runs locally.

---

## Features

- **Dictionary lookup** — double-click a Hebrew word to open a popup with translation, root, part of
  speech, and conjugation/inflection tables. Right-click a selection ("Look up in Pealim") or an image
  (OCR via Tesseract) to look up words that aren't easily selectable.
- **Spell-check** — Hebrew misspellings are underlined in inputs, textareas, and `contenteditable`
  fields. Click a flag for suggestions, "add to dictionary", or "ignore". Uses a bundled Hspell
  dictionary and runs entirely in the browser (in an offscreen document) — no network request.
- **Grammar hints** — Hebrew text is sent to the Worker's `/analyze` endpoint; grammar issues are
  underlined and clicking one shows an explanation and suggested fix.
- **Toolbar popup** — toggle spell-check on or off.

---

> **New here?** The step-by-step setup (install, permissions, which AI key to pick and where to
> get it) is in the user guide [docs/chrome-extension.md](../docs/chrome-extension.md).

## AI key

Grammar hints need your own AI key — Google Gemini (from Google AI Studio) or Cloudflare Workers AI
(an API token with Workers AI permission plus your account ID). Set it in the toolbar popup:
pick the provider, paste the key, **Test**, **Save**. It is stored in `chrome.storage.local` on this
computer only (not synced). Dictionary lookup and spell-check need no key.

## Prerequisites

- Node.js and npm
- Google Chrome (or a Chromium browser that supports Manifest V3 and the CSS Custom Highlight API)

---

## Build and load

```bash
npm install
npm run build          # outputs to dist/
```

Then load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` directory

For iterative development, `npm run dev` runs Vite in watch mode.

---

## Pointing at a Worker

By default the extension calls the deployed Worker. To use a local Worker, edit
`src/shared/config.ts`:

```ts
export const WORKER_URL = 'http://localhost:8787';
```

`localhost:8787` is already allowed in `manifest.json` `host_permissions`, and `ANALYZE_WORKER_URLS`
lists both local and production endpoints. Run the Worker locally with `npm run dev` in `../worker`.

---

## Scripts

| Script              | Purpose                          |
|---------------------|----------------------------------|
| `npm run dev`       | Vite watch build                 |
| `npm run build`     | Production build to `dist/`      |
| `npm run typecheck` | `tsc` type-check                 |
| `npm run test`      | Run the Vitest suite             |

---

## Project structure

```
extension/
├── manifest.json            # MV3 manifest
├── popup.html               # toolbar popup (spell-check toggle)
├── offscreen.html           # offscreen document host (OCR + spell engine)
├── src/
│   ├── content.ts           # content script (isolated world): lookup, spell/grammar flags
│   ├── background.ts        # service worker: wires message router + context menus
│   ├── offscreen.ts         # offscreen entry
│   ├── action-popup.ts      # toolbar popup logic
│   ├── lookup/              # lookup popup rendering, caching, worker fetch
│   ├── spellcheck/          # spell engine, controller, highlight/overlay renderers, grammar popup
│   ├── ocr/                 # Tesseract OCR engine + orchestration
│   ├── messaging/           # background message router + context menus
│   ├── shared/              # Hebrew helpers, DOM utilities, config
│   └── contracts/           # wire-format types shared across contexts
├── public/
│   ├── tesseract/           # Tesseract.js core + wasm
│   ├── tessdata/            # heb.traineddata.gz (OCR)
│   ├── spelldata/           # he.dic / he.aff (Hspell dictionary)
│   └── icons/               # extension icons
└── test/                    # Vitest tests
```

Two content scripts run per page: `content.ts` in the isolated world, and
`spellcheck/highlight-main.ts` in the MAIN world (it uses the CSS Custom Highlight API to underline
flags without mutating page DOM).

---

## License

[GNU AGPL-3.0-or-later](../LICENSE). See [../NOTICE](../NOTICE) for third-party attributions.
