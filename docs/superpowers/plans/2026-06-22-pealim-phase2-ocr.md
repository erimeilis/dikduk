# Pealim Phase 2 — Image OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Right-click a Hebrew image → on-device Tesseract.js OCR (in an MV3 offscreen document) → detected Hebrew words as chips → click one → the existing accordion lookup.

**Architecture:** Extension-only; the Worker and `/lookup` are untouched. Tesseract runs in an offscreen document (long-running WASM, reused across lookups). The background owns the image context-menu, drives the offscreen OCR, extracts Hebrew words, and pushes them to the content script, which shows chips and routes a click into the existing `lookupAndShow`.

**Tech Stack:** TypeScript, Vite + @crxjs/vite-plugin (MV3), Vitest + happy-dom, Tesseract.js (vendored locally with the `heb` model).

## Global Constraints

- Extension-only. Worker, `/lookup` contract, and the v2 accordion popup result are unchanged.
- **Engine:** Tesseract.js on-device. OCR output is treated as **unvocalized query text** (Pealim resolves bare consonants). Hebrew model `heb`.
- **Offscreen document** is the home for Tesseract (`offscreen` permission; `chrome.offscreen.createDocument` with reason and a bundled `offscreen.html`).
- **Permissions added:** `offscreen`; host permission `<all_urls>` (offscreen fetches arbitrary image bytes — bypasses page CORS); `content_security_policy.extension_pages` must include `'wasm-unsafe-eval'` (Tesseract WASM).
- **Tesseract assets vendored locally** (MV3 CSP blocks remote WASM): worker + core files under `extension/public/tesseract/`, gzipped Hebrew model at `extension/public/tessdata/heb.traineddata.gz`. Referenced via `chrome.runtime.getURL(...)` (`langPath` has no trailing slash; `corePath` is the directory of core files).
- **No Silent Failures:** every OCR/fetch/lookup failure surfaces a popup message AND logs with context. No empty catches.
- **Messages** (new, type-discriminated; existing `lookup`/`render` channels unchanged): `ocr-loading`, `ocr-words`, `ocr-error` (background→content); `ocr-image`/`ocr-result`/`ocr-failed` (background↔offscreen).
- Git: feature branch `feature/pealim-phase2-ocr`; `git add .`; compact commit messages, **no AI attribution**. Install latest deps; don't pin from memory. Never deploy without explicit user approval (this phase doesn't deploy — Worker unchanged).

---

## File Structure

```
extension/
├── manifest.json                 # MODIFY — offscreen perm, <all_urls>, CSP wasm-unsafe-eval, web_accessible_resources for assets if needed
├── vite.config.ts                # MODIFY — add offscreen.html as a build input
├── offscreen.html                # NEW — loads src/offscreen.ts
├── public/
│   ├── tesseract/                # NEW (vendored) — worker.min.js + tesseract.js-core files
│   └── tessdata/heb.traineddata.gz  # NEW (vendored, gzipped Hebrew model)
└── src/
    ├── hebrew.ts                 # MODIFY — add extractHebrewWords
    ├── popup.ts                  # MODIFY — add renderChips + OCR loading
    ├── offscreen.ts              # NEW — Tesseract recognize(srcUrl) → text
    ├── background.ts             # MODIFY — image context-menu + offscreen orchestration
    └── content.ts                # MODIFY — handle ocr-loading/ocr-words/ocr-error → chips
```

---

## Task 1: `extractHebrewWords` helper

**Files:** Modify `extension/src/hebrew.ts`; Test `extension/test/extract-hebrew-words.test.ts`.

**Interfaces:** Consumes nothing new. Produces `extractHebrewWords(text: string): string[]` — whitespace-split tokens that contain a Hebrew letter, each trimmed of surrounding punctuation, deduped, original order preserved.

- [ ] **Step 1: Verify you are on the feature branch**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git branch --show-current   # must print: feature/pealim-phase2-ocr
```
The branch already exists and is checked out. Do NOT create a new branch or switch to `main`.

- [ ] **Step 2: Write `extension/test/extract-hebrew-words.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { extractHebrewWords } from '../src/hebrew';

describe('extractHebrewWords', () => {
  it('returns Hebrew tokens, dropping Latin/punctuation-only tokens', () => {
    expect(extractHebrewWords('שלום world לבקש, 123')).toEqual(['שלום', 'לבקש']);
  });
  it('dedupes while preserving first-seen order', () => {
    expect(extractHebrewWords('לבקש לבקש שלום')).toEqual(['לבקש', 'שלום']);
  });
  it('strips surrounding punctuation but keeps niqqud-bearing words', () => {
    expect(extractHebrewWords('«מְבֻקָּשׁ».')).toEqual(['מְבֻקָּשׁ']);
  });
  it('returns [] when there is no Hebrew', () => {
    expect(extractHebrewWords('hello 42 !!!')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to confirm failure** — `cd extension && npm test -- extract-hebrew-words`
Expected: FAIL (`extractHebrewWords` not exported).

- [ ] **Step 4: Add to `extension/src/hebrew.ts`** (keep existing `containsHebrew`/`extractWord`)
```ts
export function extractHebrewWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[^א-ת]+|[^א-ת֑-ׇ]+$/gu, '');
    if (!token || !containsHebrew(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}
```
(Leading strip removes any non-Hebrew-letter prefix; trailing strip removes anything that is neither a Hebrew letter nor a niqqud mark, so a word's final niqqud is preserved while trailing punctuation is dropped. Reuses `containsHebrew`.)

- [ ] **Step 5: Run tests** — `cd extension && npm test -- extract-hebrew-words && npm run typecheck`
Expected: 4 pass; tsc clean.

- [ ] **Step 6: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Add extractHebrewWords helper for OCR token extraction"
```

---

## Task 2: `renderChips` + OCR loading state

**Files:** Modify `extension/src/popup.ts`; Modify `extension/test/popup.test.ts`.

**Interfaces:** Consumes nothing new. Produces `renderChips(words: string[]): HTMLElement` and `renderOcrLoading(): HTMLElement`. Each chip is a `<button class="pealim-chip" data-word="<word>">`.

- [ ] **Step 1: Add tests to `extension/test/popup.test.ts`** (new `describe` block; do not change existing tests)
```ts
import { renderChips, renderOcrLoading } from '../src/popup';

describe('renderChips', () => {
  it('renders one button per word, carrying the word in data-word', () => {
    const el = renderChips(['שלום', 'לבקש']);
    expect(el.getAttribute('dir')).toBe('rtl');
    const chips = el.querySelectorAll('button.pealim-chip');
    expect(chips.length).toBe(2);
    expect(chips[0].getAttribute('data-word')).toBe('שלום');
    expect(chips[0].textContent).toBe('שלום');
  });
  it('shows a no-results message for an empty list', () => {
    const el = renderChips([]);
    expect(el.querySelector('button.pealim-chip')).toBeNull();
    expect(el.textContent).toContain('No Hebrew');
  });
});

describe('renderOcrLoading', () => {
  it('renders a reading state', () => {
    const el = renderOcrLoading();
    expect(el.classList.contains('pealim-loading')).toBe(true);
    expect(el.textContent).toContain('Reading image');
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `cd extension && npm test -- popup`
Expected: FAIL (`renderChips`/`renderOcrLoading` not exported).

- [ ] **Step 3: Add to `extension/src/popup.ts`** — append these exports and chip CSS. Add to the `POPUP_CSS` string (before its closing backtick):
```css
.pealim-popup .pealim-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pealim-popup .pealim-chip { all: unset; cursor: pointer; border: 1px solid #d0d0d0; border-radius: 6px; padding: 4px 10px; font-size: 16px; color: #1a1a1a; background: #f7f7f7; }
.pealim-popup .pealim-chip:hover { background: #ececec; }
.pealim-popup .pealim-ocr-empty { color: #666; }
```
And append these functions (reusing the existing `el` helper):
```ts
export function renderChips(words: string[]): HTMLElement {
  const wrap = el('div', 'pealim-popup');
  wrap.setAttribute('dir', 'rtl');
  if (!words.length) {
    wrap.appendChild(el('div', 'pealim-ocr-empty', 'No Hebrew text found in this image.'));
    return wrap;
  }
  wrap.appendChild(el('div', 'pealim-meta', 'Tap a word:'));
  const box = el('div', 'pealim-chips');
  for (const w of words) {
    const b = document.createElement('button');
    b.className = 'pealim-chip';
    b.dataset.word = w;
    b.textContent = w;
    box.appendChild(b);
  }
  wrap.appendChild(box);
  return wrap;
}

export function renderOcrLoading(): HTMLElement {
  const wrap = el('div', 'pealim-popup pealim-loading');
  wrap.setAttribute('dir', 'rtl');
  wrap.appendChild(el('div', undefined, 'Reading image…'));
  return wrap;
}
```

- [ ] **Step 4: Run tests + typecheck** — `cd extension && npm test -- popup && npm run typecheck`
Expected: existing + new popup tests pass; tsc clean. (Do not run `npm run build` — offscreen.ts/manifest not ready until later tasks.)

- [ ] **Step 5: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Add OCR chips renderer and reading-image loading state"
```

---

## Task 3: Vendor Tesseract assets + manifest + build wiring

**Files:** Create `extension/public/tesseract/*`, `extension/public/tessdata/heb.traineddata.gz`, `extension/offscreen.html`; Modify `extension/manifest.json`, `extension/vite.config.ts`, `extension/package.json` (dep).

**Interfaces:** Produces the bundled Tesseract assets at `dist/tesseract/*` + `dist/tessdata/heb.traineddata.gz`, the `offscreen.html` page (built to `dist/offscreen.html`), and the manifest permissions/CSP. Consumed by `offscreen.ts` (Task 4).

- [ ] **Step 1: Install Tesseract**
```bash
cd extension && npm install tesseract.js tesseract.js-core
```

- [ ] **Step 2: Vendor the worker + core + Hebrew model** (assets must be local; MV3 blocks remote WASM)
```bash
cd extension
mkdir -p public/tesseract public/tessdata
cp node_modules/tesseract.js/dist/worker.min.js public/tesseract/
cp node_modules/tesseract.js-core/*.{js,wasm} public/tesseract/
# Hebrew model (tessdata_fast), gzipped to the name Tesseract.js fetches (<lang>.traineddata.gz):
curl -sL "https://github.com/tesseract-ocr/tessdata_fast/raw/main/heb.traineddata" -o /tmp/heb.traineddata
gzip -c /tmp/heb.traineddata > public/tessdata/heb.traineddata.gz
ls -la public/tesseract public/tessdata   # confirm worker.min.js, core .wasm/.js, and heb.traineddata.gz present
```
Record the exact core filenames present (they are version-specific, e.g. `tesseract-core.wasm.js`, `tesseract-core-simd.wasm.js`, `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js`) — `corePath` points at this directory and Tesseract picks the right one.

- [ ] **Step 3: Create `extension/offscreen.html`**
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script type="module" src="./src/offscreen.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Add `offscreen.html` as a build input in `extension/vite.config.ts`**
```ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: { offscreen: 'offscreen.html' },
    },
  },
});
```
(crx() handles the manifest-referenced entries; the extra `input` ensures `offscreen.html` + `src/offscreen.ts` are built and emitted to `dist/offscreen.html`.)

- [ ] **Step 5: Update `extension/manifest.json`** — add the `offscreen` permission, the `<all_urls>` host permission, and the WASM CSP. Result:
```json
{
  "manifest_version": 3,
  "name": "Pealim Hebrew Lookup",
  "version": "1.0.0",
  "description": "Double-click a Hebrew word to see its translation, root, and verb conjugation from Pealim.",
  "permissions": ["storage", "contextMenus", "offscreen"],
  "host_permissions": ["http://localhost:8787/*", "https://pealim-lookup.admice.workers.dev/*", "<all_urls>"],
  "content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
  "background": { "service_worker": "src/background.ts", "type": "module" },
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["src/content.ts"], "run_at": "document_idle" }
  ]
}
```

- [ ] **Step 6: Build to verify wiring** — `cd extension && npm run build`
Expected: build succeeds; `dist/offscreen.html`, `dist/tesseract/worker.min.js`, `dist/tesseract/*.wasm`, and `dist/tessdata/heb.traineddata.gz` all present (`ls extension/dist/tesseract extension/dist/tessdata extension/dist/offscreen.html`). `dist/manifest.json` shows the `offscreen` permission, `<all_urls>`, and the CSP.

- [ ] **Step 7: Gitignore the heavy temp, commit assets** (the vendored assets are committed so the build is reproducible)
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Vendor Tesseract assets, add offscreen build wiring and OCR permissions"
```

---

## Task 4: Offscreen OCR worker

**Files:** Create `extension/src/offscreen.ts`.

**Interfaces:** Consumes the vendored assets. Listens for `chrome.runtime` message `{ type: 'ocr-image', srcUrl }` and replies (via `sendResponse`) with `{ type: 'ocr-result', text }` or `{ type: 'ocr-failed', message }`.

- [ ] **Step 1: Implement `extension/src/offscreen.ts`**
```ts
import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('heb', 1, {
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('tesseract/'),
      langPath: chrome.runtime.getURL('tessdata'), // no trailing slash; fetches tessdata/heb.traineddata.gz
    });
  }
  return workerPromise;
}

chrome.runtime.onMessage.addListener((msg: { type?: string; srcUrl?: string }, _sender, sendResponse) => {
  if (msg?.type !== 'ocr-image' || !msg.srcUrl) return false;
  (async () => {
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(msg.srcUrl!);
      sendResponse({ type: 'ocr-result', text: data.text ?? '' });
    } catch (e) {
      console.error('[pealim] OCR failed:', e);
      sendResponse({ type: 'ocr-failed', message: (e as Error).message });
    }
  })();
  return true; // async response
});
```
Note: the exact `createWorker` signature is version-specific — if the installed Tesseract.js rejects the `(lang, oem, options)` form, consult `node_modules/tesseract.js/docs/api.md` and adapt (e.g. `createWorker({ langPath, corePath, workerPath })` then `worker.reinitialize('heb')`). Keep the same message contract and the local asset paths.

- [ ] **Step 2: Typecheck + build** — `cd extension && npm run typecheck && npm run build`
Expected: tsc clean; build succeeds with `dist/offscreen.js` (or hashed asset) referenced by `dist/offscreen.html`.

- [ ] **Step 3: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Add offscreen Tesseract OCR worker"
```

(No unit test — Tesseract/Chrome-API; verified by the real OCR run in Task 7.)

---

## Task 5: Background — image context-menu + offscreen orchestration

**Files:** Modify `extension/src/background.ts`.

**Interfaces:** Consumes `extractHebrewWords` (`./hebrew`). Adds an image context-menu; manages the offscreen document lifecycle; messages the offscreen doc and pushes `ocr-loading`/`ocr-words`/`ocr-error` to the originating tab.

- [ ] **Step 1: Add to `extension/src/background.ts`** — extend the existing `onInstalled` to also create the image menu, and add the handler. Append after the existing context-menu code:
```ts
import { extractHebrewWords } from './hebrew';

const IMAGE_MENU_ID = 'pealim-ocr-image';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: IMAGE_MENU_ID,
    title: 'Look up Hebrew in this image',
    contexts: ['image'],
  });
});

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS' as chrome.offscreen.Reason],
    justification: 'Run Tesseract.js OCR on an image off the main thread.',
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== IMAGE_MENU_ID || !tab?.id || !info.srcUrl) return;
  const tabId = tab.id;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ocr-loading' });
    await ensureOffscreen();
    const res = (await chrome.runtime.sendMessage({ type: 'ocr-image', srcUrl: info.srcUrl })) as
      | { type: 'ocr-result'; text: string }
      | { type: 'ocr-failed'; message: string };
    if (res?.type === 'ocr-result') {
      const words = extractHebrewWords(res.text);
      await chrome.tabs.sendMessage(tabId, { type: 'ocr-words', words });
    } else {
      await chrome.tabs.sendMessage(tabId, { type: 'ocr-error', message: "Couldn't read the image." });
    }
  } catch (e) {
    console.error('[pealim] OCR orchestration failed:', e);
    try { await chrome.tabs.sendMessage(tabId, { type: 'ocr-error', message: "Couldn't read the image." }); }
    catch (e2) { console.error('[pealim] could not notify tab:', e2); }
  }
});
```
Keep the existing selection-context "Look up" menu and the `runtime.onMessage` `lookup` handler intact. NOTE: the existing `onInstalled` may already create the selection menu — merge the two `create` calls into one `onInstalled` (or call both `chrome.contextMenus.create` inside a single `removeAll` callback) so both menu items register cleanly.

- [ ] **Step 2: Typecheck + build** — `cd extension && npm run typecheck && npm run build`
Expected: tsc clean (`@types/chrome` covers `chrome.offscreen`); build succeeds; `dist/manifest.json` intact.

- [ ] **Step 3: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Add image OCR context-menu and offscreen orchestration in background"
```

(No unit test — Chrome offscreen/contextMenus/tabs APIs; verified in Task 7.)

---

## Task 6: Content — OCR message handlers + chips

**Files:** Modify `extension/src/content.ts`.

**Interfaces:** Consumes `renderChips`, `renderOcrLoading` (`./popup`), and the existing `showNode`, `lookupAndShow`, `lastPointer`, `lastAnchor`. Handles `ocr-loading`/`ocr-words`/`ocr-error` and chip clicks.

- [ ] **Step 1: Add to `extension/src/content.ts`** — extend the existing `chrome.runtime.onMessage` render listener (or add a sibling) to handle the OCR messages, anchoring at the last right-click point. Import `renderChips, renderOcrLoading` from `./popup`. Add:
```ts
chrome.runtime.onMessage.addListener((msg: { type?: string; words?: string[]; message?: string }) => {
  if (msg?.type === 'ocr-loading') {
    const anchor = new DOMRect(lastPointer.x, lastPointer.y, 0, 0);
    lastAnchor = anchor;
    showNode(renderOcrLoading(), anchor);
  } else if (msg?.type === 'ocr-words') {
    const anchor = lastAnchor ?? new DOMRect(lastPointer.x, lastPointer.y, 0, 0);
    showNode(renderChips(msg.words ?? []), anchor);
  } else if (msg?.type === 'ocr-error') {
    const anchor = lastAnchor ?? new DOMRect(lastPointer.x, lastPointer.y, 0, 0);
    showNode(renderPopup({ error: msg.message ?? 'OCR failed', code: 'UPSTREAM' }), anchor);
  }
});
```
And extend the existing shadow-root delegated click listener (added for see-also) so a chip click also triggers a lookup — change its target check to also match `.pealim-chip`:
```ts
  shadow.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest('.pealim-seealso-link, .pealim-chip') as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const word = target.dataset.word;
    if (word) void lookupAndShow(word, lastAnchor ?? new DOMRect(lastPointer.x, lastPointer.y, 0, 0));
  });
```
(If the see-also listener is written inline with only `.pealim-seealso-link`, update that selector; do not duplicate the listener.)

- [ ] **Step 2: Typecheck + build** — `cd extension && npm run typecheck && npm run build`
Expected: tsc clean; build succeeds; `dist/manifest.json` present.

- [ ] **Step 3: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Content script: render OCR chips and route chip clicks to lookup"
```

(No unit test — DOM/Chrome-API glue; `renderChips`/`extractHebrewWords` are unit-tested; verified end-to-end in Task 7.)

---

## Task 7: Build + local end-to-end verification (user-confirmed)

> In-browser correctness is confirmed by the user observing it — not claimed without that confirmation.

- [ ] **Step 1: Full extension checks** — `cd extension && npm run typecheck && npm test && npm run build`
Expected: typecheck clean; unit tests green (`extract-hebrew-words`, `popup` incl. chips, plus existing); `dist/` built with `offscreen.html`, `tesseract/*`, `tessdata/heb.traineddata.gz`, and the manifest perms/CSP.

- [ ] **Step 2: Reload the extension** (user performs): `chrome://extensions` → reload the **Pealim Hebrew Lookup** card → reload the test page.

- [ ] **Step 3: Manual acceptance** (user confirms — do not claim success without it)
- Right-click an **image containing clear modern Hebrew** (e.g. a screenshot of Hebrew text, a sign) → context item **"Look up Hebrew in this image"** → "Reading image…" → after a few seconds, **chips** of the detected Hebrew words.
- Click a chip → the normal **accordion** result (translation/root/conjugation/see-also).
- Right-click a **non-Hebrew image** → "No Hebrew text found in this image."
- Confirm the first OCR is slower (model load) and subsequent ones are faster (offscreen reused).
If OCR returns garbled/empty text on clean Hebrew, capture the offscreen console (chrome://extensions → the extension's "Inspect views: offscreen.html") and report — likely an asset-path/`corePath` issue to adjust in Task 4.

- [ ] **Step 4: Commit any fixes** (only if changed)
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Phase 2 OCR verified locally"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** image context-menu → Task 5; Tesseract offscreen OCR → Tasks 3–4; chips + click→lookup reuse → Tasks 2,6; `extractHebrewWords` → Task 1; permissions/CSP/bundling → Task 3; error states (ocr-loading/words/error) → Tasks 5,6; loading state → Tasks 2,6; Worker untouched (no worker task). Out-of-scope items (region-crop, stats, crawler, seeder, fallback, spell-flag) intentionally absent.
- **Placeholder scan:** no TBD/TODO; every code step is concrete. The two version-dependent spots (exact core filenames; `createWorker` signature) are flagged with the doc to consult and adapt — not left vague.
- **Type/name consistency:** message types (`ocr-image`/`ocr-result`/`ocr-failed`, `ocr-loading`/`ocr-words`/`ocr-error`) used identically across offscreen (Task 4), background (Task 5), content (Task 6); `extractHebrewWords` (Task 1) consumed in Task 5; `renderChips`/`renderOcrLoading` (Task 2) consumed in Task 6; chip `data-word` set in Task 2, read in Task 6; `lookupAndShow`/`lastPointer`/`lastAnchor`/`showNode`/`renderPopup` reused from the existing content script.
- **Testing-stack note:** pure logic (`extractHebrewWords`, `renderChips`, `renderOcrLoading`) is unit-tested; the offscreen/Tesseract/Chrome-API integration is verified by the user in-browser (Task 7), consistent with prior phases.
```
