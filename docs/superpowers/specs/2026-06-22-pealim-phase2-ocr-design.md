# Pealim Phase 2 — Image OCR — Design Spec

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan
**Extends:** the shipped extension (v1 + v2). Worker is unchanged.

## 1. Purpose & scope

Let the reader look up a Hebrew word that lives inside a **raster image** (not selectable text). Right-click an image → OCR it on-device → show the detected Hebrew words as chips → click one → the existing accordion lookup result.

**In scope (this pass):**
- A context-menu item on images: **"Look up Hebrew in this image"**.
- On-device OCR with **Tesseract.js** (Hebrew model), run in an **MV3 offscreen document**.
- Extract the Hebrew words from the OCR text and present them as **clickable chips** in the popup.
- A chip click reuses the existing `/lookup` → accordion flow (no Worker change).
- Loading + error states.

**Out of scope for Phase 2 (separate features, each its own spec when chosen):**
- Region-crop / targeted box selection (this pass uses whole-image → chips).
- Per-user stats + "words of the day"; see-also crawler; full-dictionary seeder; Wiktionary fallback; spell-flag typing assist.

## 2. Engine & rationale

- **Tesseract.js** (WASM, in-browser): free, fully private (image bytes never leave the device), no API key. ~92–96% on clean modern Hebrew print.
- **Niqqud is not required from OCR.** Pealim's search resolves *unvocalized* consonants to the full entry, so OCR only needs the bare letters right; Pealim supplies the niqqud/conjugation. OCR uses the `heb` model and we treat its output as unvocalized query text.
- Cloud OCR (Google Vision, etc.) and Cloudflare Workers AI were considered and rejected for this pass (API key/cost/privacy; unverified Hebrew quality respectively). The OCR step is isolated behind a message interface so the engine could be swapped later without touching the rest.

## 3. Architecture

All changes are extension-side. The Worker and the `/lookup` contract are untouched.

- **Offscreen document** (`offscreen.html` + `offscreen.ts`): the MV3-correct home for long-running WASM. The service worker is ephemeral (could be killed mid-OCR) and has no DOM; the content script would load megabytes into every page. The offscreen doc loads Tesseract + the Hebrew model once and reuses it.
- **Background service worker**: owns the image context-menu, ensures the offscreen doc exists, sends it the image URL, receives the recognized text, extracts Hebrew words, and pushes them to the originating tab's content script.
- **Content script**: renders the chips popup (anchored at the right-click point) and routes a chip click into the existing `lookupAndShow(word, anchor)` path.
- **Popup**: gains a chips renderer and an OCR loading state; otherwise the accordion result is exactly as today.

### Data flow

1. Right-click an image → context menu "Look up Hebrew in this image" (`contexts: ['image']`).
2. Background `onClicked`: `info.srcUrl` is the image URL. Ensure the offscreen document exists (`chrome.offscreen.createDocument` if not already open).
3. Background tells the content script to show the **"Reading image…"** loading popup (anchored at the last right-click point), then messages the offscreen doc with `srcUrl`.
4. Offscreen doc: Tesseract `recognize(srcUrl)` → text. (Tesseract fetches the URL in the extension context, bypassing page CORS — see Permissions.)
5. Offscreen → background: the recognized text. Background runs `extractHebrewWords(text)` → deduped Hebrew tokens.
6. Background → content: `{ type: 'ocr-words', words }`. Content shows the chips popup. If `words` is empty → "No Hebrew text found in this image."
7. Chip click → content `lookupAndShow(word, anchor)` → existing background `lookup` → accordion popup (KV→D1→Pealim, voices, see-also, in-popup see-also navigation — all as built).

## 4. Permissions & bundling (required by on-device OCR)

- **`offscreen`** permission — to create the offscreen document.
- **`<all_urls>` host permission** — the offscreen doc must fetch arbitrary image bytes (cross-origin images can't be read via a tainted page canvas). This is a broad permission, inherent to OCR-ing any image; acceptable for a personal load-unpacked extension. (The content script already matches `<all_urls>`; this adds the host-permission for extension-context fetches.)
- **`web_accessible_resources`** — Tesseract's worker/core WASM and the `heb` traineddata are **bundled in the extension** (MV3's CSP blocks remote WASM/scripts), referenced via `chrome.runtime.getURL`. This adds roughly several MB to the build — acceptable for load-unpacked.

## 5. Messages (extension-internal)

```ts
// content → (existing) background lookup is unchanged: { type: 'lookup', word }
// background → content (new):
interface OcrWordsMessage { type: 'ocr-words'; words: string[] }      // show chips
interface OcrLoadingMessage { type: 'ocr-loading' }                   // show "Reading image…"
interface OcrErrorMessage { type: 'ocr-error'; message: string }      // show error popup
// background → offscreen / offscreen → background:
interface OcrRequest { type: 'ocr-image'; srcUrl: string }
interface OcrResult { type: 'ocr-result'; text: string } | { type: 'ocr-failed'; message: string }
```
The content script's existing `render` channel (context-menu word lookups) and `lookup` channel are unchanged; these OCR messages are new, type-discriminated.

## 6. Components

- `extension/manifest.json` — `offscreen` permission; `<all_urls>` host permission; `web_accessible_resources` for the Tesseract assets + `heb.traineddata`.
- `extension/src/offscreen.ts` + `extension/offscreen.html` (new) — load Tesseract (assets via `chrome.runtime.getURL`), handle `ocr-image` → `ocr-result`/`ocr-failed`.
- `extension/src/background.ts` — image context-menu create + `onClicked`; offscreen lifecycle (`hasDocument`/`createDocument`/reuse); orchestrate OCR → `extractHebrewWords` → push to content.
- `extension/src/content.ts` — handle `ocr-loading` / `ocr-words` / `ocr-error`; chips popup at the click anchor; chip click → `lookupAndShow`.
- `extension/src/popup.ts` — `renderChips(words: string[]): HTMLElement` (word buttons) + an OCR loading state (`renderLoading` reuse or a dedicated message).
- `extension/src/hebrew.ts` — `extractHebrewWords(text: string): string[]` (tokens containing a Hebrew letter, normalized, deduped, order preserved).
- Tesseract.js added as a dependency; `heb.traineddata` vendored into the extension assets.

## 7. Error handling (No Silent Failures)

Every failure path surfaces a popup message AND logs with context:
- Offscreen/Tesseract throws or times out → "Couldn't read the image".
- OCR succeeds but no Hebrew tokens → "No Hebrew text found in this image."
- Image fetch fails → "Couldn't load that image."
- Chip lookup failure → the existing `Lookup failed: …` error popup.
No empty catches; offscreen failures are reported back to the background and surfaced.

## 8. Testing

- **Unit (Vitest/happy-dom):** `extractHebrewWords` (mixed Hebrew/Latin/punctuation text → deduped Hebrew tokens, order preserved, niqqud-bearing words included); `renderChips` (words → buttons carrying the word; empty → none; a chip is clickable/has the word).
- **Manual (load-unpacked, user-confirmed):** right-click a real Hebrew image → "Reading image…" → chips of detected words → click a chip → accordion result. Also a non-Hebrew image → "No Hebrew text found". The Tesseract/offscreen/Chrome-API parts are confirmed in-browser by the user, not claimed without it.

## 9. Risks / notes

- **OCR latency:** a few seconds on a full image; the loading state covers it. Tesseract progress events can drive a percentage later if desired.
- **Accuracy:** clean modern Hebrew is good; stylized/handwritten/low-res is weaker. Because chips are user-selectable and Pealim resolves consonants, minor errors are recoverable (pick the right chip; a garbled chip simply returns "No Pealim entry").
- **Bundle size:** Tesseract + `heb.traineddata` add several MB. Fine for personal load-unpacked; would matter for a Web Store listing (a separate concern if ever pursued).
