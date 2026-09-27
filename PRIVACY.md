# DikDuk — Privacy Policy

_Last updated: 2026-09-26 (AI keys)_

DikDuk is a browser extension for reading and writing Hebrew (dictionary lookup,
spell-check, and grammar hints) and an optional macOS companion app that
translates the Hebrew interface of other Mac apps. This policy describes exactly
what data each of them handles.

## What the extension accesses

- **Text you select** on a web page — by double-clicking a Hebrew word or using
  the right-click "Look up in Pealim" menu — to look that word up.
- **Text you type** into input fields, text areas, and editable regions — to
  check Hebrew spelling and grammar as you write.
- **Images you right-click** and choose to run OCR on — to extract Hebrew words
  from the image so you can look them up.

The extension acts only on Hebrew text; other content is ignored.

## What the macOS companion accesses

- **The text of the interface element under your pointer** — a menu item,
  button, setting, or the value of a field — read through the macOS
  Accessibility API, **only while you hold the trigger key** (⌥ by default) and
  only when that text contains Hebrew. Password fields are never read.
- It needs the macOS **Accessibility** permission for this, which you grant in
  System Settings and can revoke at any time.

## What is sent off your device, and where

- **Your AI key.** Grammar checks and new UI-label translations use an AI key you
  provide (Google Gemini or Cloudflare Workers AI). The key is sent with each
  such request over HTTPS, used for that single call, and **never stored or
  logged** by the DikDuk backend. The AI provider bills your own account.
  Without a key, only dictionary lookups and already-cached translations work.
- **Dictionary lookups and grammar checks** send the specific word or text being
  looked up/checked to the DikDuk backend at
  `https://pealim-lookup.admice.workers.dev`. That service:
  - fetches dictionary data from **Pealim** (https://www.pealim.com), and
  - analyzes grammar using **Cloudflare Workers AI**.
- **Looked-up words are cached** by the backend to speed up repeat lookups. The
  cache is keyed by the word itself (Hebrew dictionary terms), not by you.
- **Grammar text** is sent to Cloudflare Workers AI for analysis and is not
  stored by the DikDuk backend.
- **The macOS companion** sends the Hebrew text under the pointer (at most 200
  characters) to the same backend's `/translate` endpoint, which translates it
  with **Cloudflare Workers AI**, and sends its individual words to `/lookup`.
  Translations are **cached by the backend indefinitely**, keyed by the text
  itself (not by you), so a label is only translated once. Because a field's
  value can be text you typed, avoid holding the trigger key over private text.

## What never leaves your device

- **Spell-checking runs entirely in your browser** using a bundled Hebrew
  dictionary (Hspell). Words you type are **not** sent anywhere for spell-check.
- **OCR runs in your browser** (Tesseract). Images are processed locally; only
  the extracted words you choose to look up are then sent, like any other lookup.
- **Your personal dictionary** (words you add) and the **spell-check on/off
  setting** are stored locally in the browser (`chrome.storage.local`).
- **The macOS companion's settings** (enabled, trigger key) and its **local
  cache of results** (`~/Library/Caches/DikDuk/cache.json`) stay on your Mac.
- **Where your AI key is kept:** the macOS app stores it in your Keychain; the
  extension in `chrome.storage.local` on this computer (not synced, not
  encrypted at rest).

## What DikDuk does not do

- No analytics, tracking, or advertising.
- No user accounts; no collection of names, emails, or other identifiers.
- Your data is never sold or shared beyond the processing described above.

## Third parties

- **Pealim** (https://www.pealim.com) — source of dictionary data.
- **Cloudflare** — hosts the backend and provides AI grammar analysis and
  UI-label translation (on your own account if you use a Workers AI key).
- **Google** — Gemini, if you choose it as your AI provider.

## Contact

Questions or requests: https://github.com/erimeilis/dikduk/issues

## License

DikDuk is open source under the GNU AGPL-3.0-or-later.
