# DikDuk — Privacy Policy

_Last updated: 2026-07-03_

DikDuk is a browser extension for reading and writing Hebrew: dictionary lookup,
spell-check, and grammar hints. This policy describes exactly what data the
extension handles.

## What the extension accesses

- **Text you select** on a web page — by double-clicking a Hebrew word or using
  the right-click "Look up in Pealim" menu — to look that word up.
- **Text you type** into input fields, text areas, and editable regions — to
  check Hebrew spelling and grammar as you write.
- **Images you right-click** and choose to run OCR on — to extract Hebrew words
  from the image so you can look them up.

The extension acts only on Hebrew text; other content is ignored.

## What is sent off your device, and where

- **Dictionary lookups and grammar checks** send the specific word or text being
  looked up/checked to the DikDuk backend at
  `https://pealim-lookup.admice.workers.dev`. That service:
  - fetches dictionary data from **Pealim** (https://www.pealim.com), and
  - analyzes grammar using **Cloudflare Workers AI**.
- **Looked-up words are cached** by the backend to speed up repeat lookups. The
  cache is keyed by the word itself (Hebrew dictionary terms), not by you.
- **Grammar text** is sent to Cloudflare Workers AI for analysis and is not
  stored by the DikDuk backend.

## What never leaves your device

- **Spell-checking runs entirely in your browser** using a bundled Hebrew
  dictionary (Hspell). Words you type are **not** sent anywhere for spell-check.
- **OCR runs in your browser** (Tesseract). Images are processed locally; only
  the extracted words you choose to look up are then sent, like any other lookup.
- **Your personal dictionary** (words you add) and the **spell-check on/off
  setting** are stored locally in the browser (`chrome.storage.local`).

## What DikDuk does not do

- No analytics, tracking, or advertising.
- No user accounts; no collection of names, emails, or other identifiers.
- Your data is never sold or shared beyond the processing described above.

## Third parties

- **Pealim** (https://www.pealim.com) — source of dictionary data.
- **Cloudflare** — hosts the backend and provides AI grammar analysis.

## Contact

Questions or requests: https://github.com/erimeilis/dikduk/issues

## License

DikDuk is open source under the GNU AGPL-3.0-or-later.
