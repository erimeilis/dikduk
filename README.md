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
  are underlined; click one for an explanation and suggested fix. Uses your own AI key (Gemini or Cloudflare
  Workers AI); dictionary lookup and spell-check need none.
- **Hover translation on macOS** — the companion app reads the Hebrew text under the pointer in any
  app (including Chrome's own menus, toolbar, and settings, which an extension cannot reach) while
  you hold ⌥, and shows its English meaning plus a Pealim breakdown of each term. ⌥+click pins the
  panel; click a term to open it on Pealim. New translations use your own AI key; cached ones are free.

---

## Install and use

### What works with and without an AI key

| Feature | Needs an AI key? |
| --- | --- |
| Dictionary lookup (double-click, right-click, OCR) | No |
| Spell-check | No — runs entirely in your browser |
| Grammar hints (extension) | **Yes** |
| Hover translation (macOS app) — labels someone already translated | No — served from the shared cache |
| Hover translation (macOS app) — new labels | **Yes** |
| Term breakdown in the macOS panel (meaning, root, related words) | No |

The AI runs on **your own** account at Google or Cloudflare, so you pay for your own usage (both have
a free allowance). DikDuk never stores your key: it is sent with each AI request and used for that
one request only.

### Chrome extension

The extension is not in the Chrome Web Store yet; you load it from a build.

1. Build it once (needs Node.js): `cd extension && npm install && npm run build`.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension/dist` folder.
4. Click the puzzle-piece icon in the toolbar and pin **DikDuk**.

What Chrome asks you to allow, and why:

- **Read and change all your data on all websites** — to find Hebrew words on the pages you read
  and to underline spelling and grammar in the fields you type in. Only two things leave your
  computer: words you look up, and — once you have saved an AI key — the text of Hebrew fields you
  type in, for grammar checks. Spell-check never sends anything.
- **Storage** — your personal dictionary, settings, and AI key, kept on this computer.
- **Context menus** — the right-click "Look up" entry.
- **Offscreen documents** — runs OCR and the spell-checker in the background.

To add your AI key: click the DikDuk icon › **AI key** › choose the provider, paste the key (and,
for Cloudflare, your account ID) › **Test** › **Save**.

### macOS companion

Requires macOS 15 or later.

1. Download `DikDuk-macos-<version>.zip` from
   [Releases](https://github.com/erimeilis/dikduk/releases) — **version 0.2.0 or later** (0.1.0
   predates AI keys). Or build it: `cd macos && scripts/bundle.sh`.
2. Unzip it and move **DikDuk.app** to Applications.
3. **Right-click › Open › Open** the first time. The app is not signed with an Apple Developer ID, so
   a plain double-click is blocked by Gatekeeper.
4. Allow **Accessibility** when asked (System Settings › Privacy & Security › Accessibility › turn on
   DikDuk). It lets DikDuk read the text of the menu or button under your pointer. Password fields
   are never read.
5. Menu-bar icon › **AI key…** › choose the provider, paste the key › **Test** › **Save**. The key is
   stored in your Keychain. If macOS asks whether DikDuk may use it, choose **Always Allow**.
6. Hold **⌥** over Hebrew text in any app. ⌥+click pins the panel; Esc closes it.

For Chrome's own menus to be in Hebrew: System Settings › General › Language & Region ›
Applications › **+** › Google Chrome › Hebrew, then restart Chrome.

### Which AI key to choose

| | Cloudflare Workers AI (recommended) | Google Gemini |
| --- | --- | --- |
| Tested with DikDuk | Yes — translations and grammar verified live | Not yet tested live |
| Free allowance | 10,000 Neurons per day — roughly 2,400 new UI-label translations or about 1,000 grammar checks | Free tier with per-model daily request limits (see Google AI Studio) |
| Setup | API token **and** account ID | One key |
| Beyond the free allowance | Workers Paid plan ($5/month) plus usage | Pay-as-you-go billing in Google AI Studio |

Pick **Cloudflare Workers AI** if you want what is known to work today; pick **Gemini** if you want
the quickest setup and are fine being the first to try it.

**Get a Cloudflare Workers AI key**

1. Sign up or log in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Open **Workers AI** in the sidebar and select **Use REST API**.
3. Select **Create a Workers AI API Token** › **Create API Token** › **Copy API Token**.
   (A hand-made token needs the permissions *Workers AI – Read* and *Workers AI – Edit*.)
4. On the same page, copy the **Account ID**.
5. In DikDuk choose **Cloudflare Workers AI** and paste both.

**Get a Google Gemini key**

1. Sign in at [aistudio.google.com](https://aistudio.google.com) with a Google account.
2. Open **Get API key** and select **Create API key**, then copy it.
3. In DikDuk choose **Google Gemini** and paste the key.

### If something says…

| Message | Meaning |
| --- | --- |
| "add your AI key" / "Grammar needs your AI key" | No key saved — see above. |
| "AI key rejected" | The provider refused the key: check you pasted all of it (and, for Cloudflare, the right account ID). |
| "offline" | DikDuk can't reach its server — check your connection. |
| "No AI key — translations from cache only" (macOS menu) | Only labels someone translated before will show a translation. |
| "Keychain error" (macOS menu) | macOS denied access to the saved key — re-save it in **AI key…** and choose **Always Allow**. |

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
  grammar analysis and UI-label translation to AI on the caller's own key (Workers AI or Gemini;
  translations are cached in KV).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how each part is built and works internally.

---

## Build from source (developers)

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
