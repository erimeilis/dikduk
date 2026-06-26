# Phase 3 — Hebrew Typing Assist (spell-flag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag likely-mistyped Hebrew words as the user types in any DOM-text editable field, and offer one-click corrections + a Pealim lookup — fully on-device.

**Architecture:** A self-contained `extension/src/spellcheck/` subsystem. A bundled Hunspell engine (nspell) + the Hspell Hebrew dictionary run inside a dedicated Web Worker (heavy parse off the main thread). A content-side controller debounces edits, tokenizes/normalizes the field text, asks the worker which tokens are misspelled, and marks them via two renderers: the CSS Custom Highlight API (run in the page MAIN world) for `contenteditable`/DOM text, and a mirror-div overlay for `<input>`/`<textarea>`. Clicking a flag asks the worker for suggestions and shows a popup (reusing the existing Shadow-DOM popup host) to replace, look up, ignore, or add-to-dictionary. The Worker and `/lookup` are untouched.

**Tech Stack:** TypeScript (strict), Vite + `@crxjs/vite-plugin` (MV3), Vitest + happy-dom, `nspell` (Hunspell-compatible JS engine), Hspell `he` dictionary (via `wooorm/dictionaries`).

## Global Constraints

- **License:** the whole repo is **AGPLv3** (the bundled dictionary is AGPL data); add a root `LICENSE` (AGPLv3 full text) and a `NOTICE` crediting Hspell (© 2000–2017 Nadav Har'El & Dan Kenigsberg, http://hspell.ivrix.org.il/).
- **On-device only:** no network/Worker call for spell-checking; **no keystroke ever leaves the device**. `background.ts`, `worker/`, and the `/lookup` contract are **unchanged**.
- **No new Chrome permissions.** Manifest may only add `web_accessible_resources` (engine worker asset + dict files) and one `content_scripts` entry with `"world": "MAIN"`.
- **Reuse, don't reinvent:** reuse the Shadow-DOM popup host + `POPUP_CSS` + `computePosition` from the existing extension, and `containsHebrew` from `src/hebrew.ts`.
- **Tooling:** all commands run from `extension/`. Tests live in `extension/test/**/*.test.ts` (Vitest, happy-dom). `npm run typecheck` (`tsc`, strict, no emit) and `npm test` and `npm run build` must all be clean before a task is done.
- **Engine:** `nspell` constructed from **string** `aff`/`dic`; `correct(w): boolean`, `suggest(w): string[]`.
- **Dictionary artifact:** Hspell `he` from `wooorm/dictionaries` — `he.dic` (341,585 entries) + `he.aff`, vendored verbatim under `extension/public/spelldata/`.

---

## File Structure

| File | Responsibility |
|---|---|
| `LICENSE`, `NOTICE` (repo root) | AGPLv3 text + Hspell attribution |
| `extension/public/spelldata/he.dic`, `he.aff` | Vendored Hspell dictionary (copied verbatim into the build) |
| `extension/src/spellcheck/normalize.ts` | Diacritic stripping, Hebrew tokenization with offsets, skip rules |
| `extension/src/spellcheck/userdict.ts` | Persistent allow-list + global enabled toggle (chrome.storage) |
| `extension/src/spellcheck/replace.ts` | Replace text in a field/range, dispatch `InputEvent`, restore caret |
| `extension/src/spellcheck/suggest-popup.ts` | Render the suggestion/action popup DOM |
| `extension/src/spellcheck/protocol.ts` | Worker message types |
| `extension/src/spellcheck/engine-worker.ts` | Web Worker: load nspell + dict; answer `check`/`suggest` |
| `extension/src/spellcheck/nspell.d.ts` | Ambient type declaration for `nspell` |
| `extension/src/spellcheck/render-overlay.ts` | Mirror-div underline overlay for input/textarea |
| `extension/src/spellcheck/highlight-main.ts` | MAIN-world CSS Custom Highlight API renderer |
| `extension/src/spellcheck/controller.ts` | Field engagement, debounce, orchestration, teardown |
| `extension/src/content.ts` (modify) | Init the controller; route flag clicks into existing `lookupAndShow` |
| `extension/src/popup.ts` (modify) | Export `el`; add suggestion-popup CSS to `POPUP_CSS` |
| `extension/manifest.json` (modify) | `web_accessible_resources`; `world:"MAIN"` content script |

---

## Task 1: Vendor dictionary + engine, add AGPLv3 license

**Files:**
- Create: `LICENSE`, `NOTICE` (repo root)
- Create: `extension/public/spelldata/he.dic`, `extension/public/spelldata/he.aff`
- Modify: `extension/package.json` (add `nspell` dep; set `license`), `worker/package.json:14` (set `license`)
- Create: `extension/src/spellcheck/nspell.d.ts`

**Interfaces:**
- Produces: vendored dict at runtime URL `chrome.runtime.getURL('spelldata/he.dic')` / `…he.aff`; the `nspell` module importable with types.

- [ ] **Step 1: Install nspell**

Run:
```bash
cd extension && npm install nspell@^2.1.5
```
Expected: `nspell` appears under `dependencies` in `extension/package.json`.

- [ ] **Step 2: Vendor the Hspell dictionary**

Run:
```bash
cd extension && mkdir -p public/spelldata && \
curl -sL -o public/spelldata/he.dic "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/he/index.dic" && \
curl -sL -o public/spelldata/he.aff "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/he/index.aff" && \
wc -l public/spelldata/he.dic && head -1 public/spelldata/he.dic
```
Expected: `he.dic` ≈ 341,827 lines; first line is the count `341585`. `he.aff` header mentions the Hspell project.

- [ ] **Step 3: Add AGPLv3 LICENSE + NOTICE**

Write `LICENSE` with the full GNU AGPLv3 text (from https://www.gnu.org/licenses/agpl-3.0.txt). Write `NOTICE`:
```
Pealim Hebrew Lookup
Copyright (C) 2026

This program is free software: licensed under the GNU Affero General Public
License v3.0. See LICENSE.

Hebrew spelling dictionary derived from the Hspell project
(http://hspell.ivrix.org.il/), Copyright (C) 2000-2017 Nadav Har'El and
Dan Kenigsberg, licensed under the GNU AGPL v3. The dictionary files and
generated word lists are also under the AGPL.
nspell (https://github.com/wooorm/nspell) Copyright (C) Titus Wormer, MIT.
```

- [ ] **Step 4: Set the license field in both package.json files**

In `extension/package.json` and `worker/package.json`, set `"license": "AGPL-3.0-or-later"`.

- [ ] **Step 5: Add the nspell ambient type declaration**

Create `extension/src/spellcheck/nspell.d.ts`:
```ts
declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string, model?: string): NSpell;
  }
  function nspell(input: { aff: string; dic: string }): NSpell;
  function nspell(aff: string, dic: string): NSpell;
  export default nspell;
}
```

- [ ] **Step 6: Verify typecheck still passes**

Run: `cd extension && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "Vendor Hspell dictionary + nspell, add AGPLv3 license"
```

---

## Task 2: Normalization + Hebrew tokenizer + skip rules

**Files:**
- Create: `extension/src/spellcheck/normalize.ts`
- Test: `extension/test/spell-normalize.test.ts`

**Interfaces:**
- Produces:
  - `interface Token { text: string; start: number; end: number }`
  - `stripDiacritics(s: string): string`
  - `tokenizeHebrew(source: string): Token[]`
  - `shouldSkip(token: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `extension/test/spell-normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { stripDiacritics, tokenizeHebrew, shouldSkip } from '../src/spellcheck/normalize';

describe('stripDiacritics', () => {
  it('removes niqqud and cantillation, keeps letters', () => {
    expect(stripDiacritics('מְבֻקָּשׁ')).toBe('מבקש');
  });
  it('removes zero-width / bidi marks', () => {
    expect(stripDiacritics('שלום‏')).toBe('שלום');
  });
});

describe('tokenizeHebrew', () => {
  it('returns Hebrew tokens with correct offsets', () => {
    const toks = tokenizeHebrew('hi שלום, עולם!');
    expect(toks.map((t) => t.text)).toEqual(['שלום', 'עולם']);
    expect(toks[0]).toMatchObject({ text: 'שלום', start: 3, end: 7 });
  });
  it('keeps niqqud inside a token whole', () => {
    expect(tokenizeHebrew('מְבֻקָּשׁ')[0].text).toBe('מְבֻקָּשׁ');
  });
});

describe('shouldSkip', () => {
  it('skips tokens shorter than 2 letters', () => {
    expect(shouldSkip('ש')).toBe(true);
  });
  it('skips mixed Latin/digit tokens', () => {
    expect(shouldSkip('שwifi')).toBe(true);
    expect(shouldSkip('קו5')).toBe(true);
  });
  it('skips acronyms with gershayim/geresh', () => {
    expect(shouldSkip('צה״ל')).toBe(true);
    expect(shouldSkip('ד״ר')).toBe(true);
  });
  it('does not skip an ordinary word', () => {
    expect(shouldSkip('שלום')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run test/spell-normalize.test.ts`
Expected: FAIL — cannot resolve `../src/spellcheck/normalize`.

- [ ] **Step 3: Write minimal implementation**

Create `extension/src/spellcheck/normalize.ts`:
```ts
// Hebrew combining marks (niqqud + cantillation; all Unicode Mn), excluding
// the spacing punctuation at U+05BE/05C0/05C3/05C6 which tokenization handles.
const COMBINING = /[֑-ׇֽֿׁׂׅׄ]/g;
const ZERO_WIDTH = /[​-‏‪-‮⁠﻿]/g;
// A token: a Hebrew letter followed by more letters / marks / in-word symbols.
const TOKEN = /[א-ת][א-ת֑-ׇ׳״'"]*/gu;

export interface Token {
  text: string;
  start: number;
  end: number;
}

export function stripDiacritics(s: string): string {
  return s.replace(COMBINING, '').replace(ZERO_WIDTH, '');
}

export function tokenizeHebrew(source: string): Token[] {
  const out: Token[] = [];
  for (const m of source.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    out.push({ text: m[0], start, end: start + m[0].length });
  }
  return out;
}

export function shouldSkip(token: string): boolean {
  if (/[A-Za-z0-9]/.test(token)) return true; // mixed Latin/digits
  if (/[׳״'"]/.test(token)) return true; // acronym / abbreviation
  const letters = stripDiacritics(token).replace(/[^א-ת]/g, '');
  return letters.length < 2; // too short to judge
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run test/spell-normalize.test.ts`
Expected: PASS (all 8 assertions).

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "Add Hebrew normalize/tokenize/skip helpers for spell-check"
```

---

## Task 3: User dictionary + enabled toggle (chrome.storage)

**Files:**
- Create: `extension/src/spellcheck/userdict.ts`
- Test: `extension/test/spell-userdict.test.ts`

**Interfaces:**
- Produces:
  - `loadUserDict(): Promise<Set<string>>`
  - `addUserWord(word: string): Promise<void>`
  - `isEnabled(): Promise<boolean>` (default `true`)
  - `setEnabled(on: boolean): Promise<void>`
- Storage keys: `'pealim:spell:dict'` (string[]), `'pealim:spell:enabled'` (boolean).

- [ ] **Step 1: Write the failing test**

Create `extension/test/spell-userdict.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadUserDict, addUserWord, isEnabled, setEnabled } from '../src/spellcheck/userdict';

const store: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  // minimal chrome.storage.local stub
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
      },
    },
  };
});

describe('userdict', () => {
  it('loads an empty set when nothing stored', async () => {
    expect([...(await loadUserDict())]).toEqual([]);
  });
  it('adds a word and reloads it (deduped)', async () => {
    await addUserWord('שלום');
    await addUserWord('שלום');
    expect([...(await loadUserDict())]).toEqual(['שלום']);
  });
  it('enabled defaults to true and can be toggled', async () => {
    expect(await isEnabled()).toBe(true);
    await setEnabled(false);
    expect(await isEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run test/spell-userdict.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

Create `extension/src/spellcheck/userdict.ts`:
```ts
const DICT_KEY = 'pealim:spell:dict';
const ENABLED_KEY = 'pealim:spell:enabled';

export async function loadUserDict(): Promise<Set<string>> {
  try {
    const got = await chrome.storage.local.get(DICT_KEY);
    return new Set((got[DICT_KEY] as string[]) ?? []);
  } catch (e) {
    console.error('[pealim] spell dict read failed:', e);
    return new Set();
  }
}

export async function addUserWord(word: string): Promise<void> {
  try {
    const set = await loadUserDict();
    set.add(word);
    await chrome.storage.local.set({ [DICT_KEY]: [...set] });
  } catch (e) {
    console.error('[pealim] spell dict write failed:', e);
  }
}

export async function isEnabled(): Promise<boolean> {
  try {
    const got = await chrome.storage.local.get(ENABLED_KEY);
    return (got[ENABLED_KEY] as boolean | undefined) ?? true;
  } catch (e) {
    console.error('[pealim] spell enabled read failed:', e);
    return true;
  }
}

export async function setEnabled(on: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [ENABLED_KEY]: on });
  } catch (e) {
    console.error('[pealim] spell enabled write failed:', e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run test/spell-userdict.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "Add spell-check user dictionary + enabled toggle store"
```

---

## Task 4: Text replacement helpers

**Files:**
- Create: `extension/src/spellcheck/replace.ts`
- Test: `extension/test/spell-replace.test.ts`

**Interfaces:**
- Produces:
  - `replaceInTextField(field: HTMLInputElement | HTMLTextAreaElement, start: number, end: number, replacement: string): void`
  - `replaceInRange(range: Range, replacement: string): void`

- [ ] **Step 1: Write the failing test**

Create `extension/test/spell-replace.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { replaceInTextField, replaceInRange } from '../src/spellcheck/replace';

describe('replaceInTextField', () => {
  it('splices the value, restores caret, and dispatches input', () => {
    const ta = document.createElement('textarea');
    ta.value = 'אני רוצה שלוום עכשיו';
    document.body.appendChild(ta);
    const onInput = vi.fn();
    ta.addEventListener('input', onInput);
    // "שלוום" occupies indices 9..14
    replaceInTextField(ta, 9, 14, 'שלום');
    expect(ta.value).toBe('אני רוצה שלום עכשיו');
    expect(ta.selectionStart).toBe(9 + 'שלום'.length);
    expect(onInput).toHaveBeenCalledOnce();
  });
});

describe('replaceInRange', () => {
  it('replaces the range text and dispatches input on the editable host', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.textContent = 'שלוום';
    document.body.appendChild(div);
    const onInput = vi.fn();
    div.addEventListener('input', onInput);
    const range = document.createRange();
    range.setStart(div.firstChild!, 0);
    range.setEnd(div.firstChild!, 5);
    replaceInRange(range, 'שלום');
    expect(div.textContent).toBe('שלום');
    expect(onInput).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run test/spell-replace.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

Create `extension/src/spellcheck/replace.ts`:
```ts
export function replaceInTextField(
  field: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string,
): void {
  const v = field.value;
  field.value = v.slice(0, start) + replacement + v.slice(end);
  const caret = start + replacement.length;
  field.setSelectionRange(caret, caret);
  field.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

export function replaceInRange(range: Range, replacement: string): void {
  range.deleteContents();
  const node = document.createTextNode(replacement);
  range.insertNode(node);

  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const after = document.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    sel.addRange(after);
  }

  const host =
    (node.parentElement?.closest('[contenteditable]') as HTMLElement | null) ??
    node.parentElement;
  host?.dispatchEvent(new InputEvent('input', { bubbles: true }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run test/spell-replace.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "Add spell-check text replacement helpers"
```

---

## Task 5: Suggestion popup rendering + CSS

**Files:**
- Create: `extension/src/spellcheck/suggest-popup.ts`
- Modify: `extension/src/popup.ts` (export `el`; append CSS to `POPUP_CSS`)
- Test: `extension/test/spell-suggest-popup.test.ts`

**Interfaces:**
- Consumes: `el(tag, cls?, text?)` and `POPUP_CSS` from `../popup`.
- Produces: `renderSuggestions(word: string, suggestions: string[]): HTMLElement`. Suggestion buttons carry `data-suggest`; action buttons carry `data-action` ∈ `{'lookup','add','ignore'}`.

- [ ] **Step 1: Write the failing test**

Create `extension/test/spell-suggest-popup.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderSuggestions } from '../src/spellcheck/suggest-popup';

describe('renderSuggestions', () => {
  it('renders one button per suggestion carrying data-suggest + the three actions', () => {
    const el = renderSuggestions('שלוום', ['שלום', 'שלומו']);
    expect(el.getAttribute('dir')).toBe('rtl');
    const sugg = el.querySelectorAll('button[data-suggest]');
    expect(sugg.length).toBe(2);
    expect(sugg[0].getAttribute('data-suggest')).toBe('שלום');
    const actions = Array.from(el.querySelectorAll('button[data-action]')).map((b) =>
      b.getAttribute('data-action'),
    );
    expect(actions).toEqual(['lookup', 'add', 'ignore']);
  });
  it('shows a no-suggestions message but still offers actions', () => {
    const el = renderSuggestions('זזזז', []);
    expect(el.querySelector('button[data-suggest]')).toBeNull();
    expect(el.textContent).toContain('No suggestions');
    expect(el.querySelectorAll('button[data-action]').length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run test/spell-suggest-popup.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Export `el` from popup.ts and add CSS**

In `extension/src/popup.ts`, change `function el(` to `export function el(`. Then append to the `POPUP_CSS` template literal (before its closing backtick):
```css
.pealim-popup .pealim-spell-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px; }
.pealim-popup .pealim-spell-action { all: unset; cursor: pointer; font-size: 12px; color: #2563eb; }
.pealim-popup .pealim-spell-action:hover { text-decoration: underline; }
```

- [ ] **Step 4: Write the renderer**

Create `extension/src/spellcheck/suggest-popup.ts`:
```ts
import { el } from '../popup';

export function renderSuggestions(word: string, suggestions: string[]): HTMLElement {
  const wrap = el('div', 'pealim-popup');
  wrap.setAttribute('dir', 'rtl');
  wrap.appendChild(el('div', 'pealim-meta', `“${word}”`));

  if (suggestions.length) {
    const box = el('div', 'pealim-chips');
    for (const s of suggestions) {
      const b = document.createElement('button');
      b.className = 'pealim-chip';
      b.dataset.suggest = s;
      b.textContent = s;
      box.appendChild(b);
    }
    wrap.appendChild(box);
  } else {
    wrap.appendChild(el('div', 'pealim-ocr-empty', 'No suggestions'));
  }

  const actions = el('div', 'pealim-spell-actions');
  const mk = (action: string, label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'pealim-spell-action';
    b.dataset.action = action;
    b.textContent = label;
    return b;
  };
  actions.appendChild(mk('lookup', 'Look up in Pealim'));
  actions.appendChild(mk('add', 'Add to my words'));
  actions.appendChild(mk('ignore', 'Ignore'));
  wrap.appendChild(actions);
  return wrap;
}
```

- [ ] **Step 5: Run tests + typecheck to verify pass**

Run: `cd extension && npx vitest run test/spell-suggest-popup.test.ts test/popup.test.ts && npm run typecheck`
Expected: PASS (new + existing popup tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "Add spell-check suggestion popup renderer + CSS"
```

---

## Task 6: Engine Web Worker + build wiring (in-browser verified)

**Files:**
- Create: `extension/src/spellcheck/protocol.ts`
- Create: `extension/src/spellcheck/engine-worker.ts`
- Modify: `extension/manifest.json` (add `web_accessible_resources`)

**Interfaces:**
- Produces (`protocol.ts`):
```ts
export type ToWorker =
  | { type: 'init'; affUrl: string; dicUrl: string }
  | { type: 'check'; id: number; tokens: string[] }
  | { type: 'suggest'; id: number; word: string };
export type FromWorker =
  | { type: 'ready' }
  | { type: 'checked'; id: number; misspelled: string[] }
  | { type: 'suggested'; id: number; word: string; suggestions: string[] }
  | { type: 'error'; message: string };
```
- The controller (Task 9) creates the worker with `new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' })` and sends an `init` with URLs from `chrome.runtime.getURL('spelldata/he.aff' | 'spelldata/he.dic')`.

- [ ] **Step 1: Write the protocol types**

Create `extension/src/spellcheck/protocol.ts` with the `ToWorker`/`FromWorker` unions above.

- [ ] **Step 2: Write the worker**

Create `extension/src/spellcheck/engine-worker.ts`:
```ts
import nspell from 'nspell';
import type { ToWorker, FromWorker } from './protocol';

let spell: ReturnType<typeof nspell> | null = null;

function post(msg: FromWorker): void {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = async (e: MessageEvent<ToWorker>): Promise<void> => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      const [aff, dic] = await Promise.all([
        fetch(msg.affUrl).then((r) => r.text()),
        fetch(msg.dicUrl).then((r) => r.text()),
      ]);
      spell = nspell({ aff, dic });
      post({ type: 'ready' });
    } else if (msg.type === 'check') {
      const misspelled = spell ? msg.tokens.filter((w) => !spell!.correct(w)) : [];
      post({ type: 'checked', id: msg.id, misspelled });
    } else if (msg.type === 'suggest') {
      const suggestions = spell ? spell.suggest(msg.word).slice(0, 6) : [];
      post({ type: 'suggested', id: msg.id, word: msg.word, suggestions });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
```

- [ ] **Step 3: Add the dict files to web_accessible_resources**

In `extension/manifest.json`, add (top-level):
```json
"web_accessible_resources": [
  { "resources": ["spelldata/he.dic", "spelldata/he.aff"], "matches": ["<all_urls>"] }
]
```

- [ ] **Step 4: Typecheck + build**

Run: `cd extension && npm run typecheck && npm run build`
Expected: typecheck clean; build succeeds and `dist/` contains the bundled worker chunk and `spelldata/he.dic`/`he.aff`.

Verify: `ls extension/dist/spelldata/` shows `he.dic` and `he.aff`.

- [ ] **Step 5: In-browser smoke test (user-confirmed)**

Load `extension/dist` unpacked in Chrome. On any normal web page, open DevTools console (the page's context is fine for this smoke test) and run:
```js
const u = (p) => chrome.runtime.getURL(p); // run in the extension's content-script console
```
Then add a temporary console probe in `content.ts` (removed after) OR verify via the controller in Task 9. **Minimal acceptance for this task:** in `chrome://extensions` the worker chunk loads with **no CSP error** when the controller (Task 9) first constructs it; if a CSP/`blob:` error appears here, switch the engine host to the existing offscreen document (mirror `ensureOffscreen`/`sendToOffscreen` in `background.ts`) — message-shape stays identical. Note which path was used in the commit message.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "Add nspell engine Web Worker + dict web-accessible resources"
```

---

## Task 7: Mirror-overlay renderer (input/textarea)

**Files:**
- Create: `extension/src/spellcheck/render-overlay.ts`
- Test: `extension/test/spell-overlay.test.ts`

**Interfaces:**
- Produces:
  - `class OverlayRenderer { constructor(field: HTMLInputElement | HTMLTextAreaElement); mark(ranges: Token[]): void; clear(): void; destroy(): void; }`
  - It overlays a positioned mirror element on the field; flagged substrings get `<span class="pealim-misspell">`. Exposes nothing else.
- Consumes: `Token` from `./normalize`.

- [ ] **Step 1: Write the failing test**

Create `extension/test/spell-overlay.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { OverlayRenderer } from '../src/spellcheck/render-overlay';

describe('OverlayRenderer', () => {
  it('renders a mark span per flagged range and clears them', () => {
    const ta = document.createElement('textarea');
    ta.value = 'אני רוצה שלוום';
    document.body.appendChild(ta);
    const r = new OverlayRenderer(ta);
    r.mark([{ text: 'שלוום', start: 9, end: 14 }]);
    const marks = r.overlayEl.querySelectorAll('.pealim-misspell');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('שלוום');
    r.clear();
    expect(r.overlayEl.querySelectorAll('.pealim-misspell').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run test/spell-overlay.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

Create `extension/src/spellcheck/render-overlay.ts`:
```ts
import type { Token } from './normalize';

const COPIED_STYLES = [
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'textAlign', 'direction', 'padding', 'border', 'boxSizing', 'whiteSpace',
  'wordWrap', 'width', 'height',
] as const;

export class OverlayRenderer {
  readonly overlayEl: HTMLDivElement;
  private field: HTMLInputElement | HTMLTextAreaElement;

  constructor(field: HTMLInputElement | HTMLTextAreaElement) {
    this.field = field;
    this.overlayEl = document.createElement('div');
    this.overlayEl.setAttribute('aria-hidden', 'true');
    this.overlayEl.style.cssText =
      'position:absolute;pointer-events:none;color:transparent;overflow:hidden;z-index:2147483646;';
    document.body.appendChild(this.overlayEl);
    this.syncStyle();
  }

  private syncStyle(): void {
    const cs = getComputedStyle(this.field);
    for (const k of COPIED_STYLES) this.overlayEl.style[k] = cs[k];
    const rect = this.field.getBoundingClientRect();
    this.overlayEl.style.left = `${rect.left + window.scrollX}px`;
    this.overlayEl.style.top = `${rect.top + window.scrollY}px`;
    this.overlayEl.style.whiteSpace = 'pre-wrap';
  }

  mark(ranges: Token[]): void {
    this.syncStyle();
    this.overlayEl.textContent = '';
    const v = this.field.value;
    let cursor = 0;
    for (const r of ranges) {
      this.overlayEl.appendChild(document.createTextNode(v.slice(cursor, r.start)));
      const span = document.createElement('span');
      span.className = 'pealim-misspell';
      span.textContent = v.slice(r.start, r.end);
      span.dataset.start = String(r.start);
      span.dataset.end = String(r.end);
      this.overlayEl.appendChild(span);
      cursor = r.end;
    }
    this.overlayEl.appendChild(document.createTextNode(v.slice(cursor)));
    this.overlayEl.scrollTop = this.field.scrollTop;
  }

  clear(): void {
    this.overlayEl.textContent = '';
  }

  destroy(): void {
    this.overlayEl.remove();
  }
}
```
Note: the `.pealim-misspell` underline style is injected once by the controller (Task 9) into a page `<style>`: `.pealim-misspell{ text-decoration: red wavy underline; pointer-events: auto; }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run test/spell-overlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "Add mirror-overlay renderer for input/textarea spell flags"
```

---

## Task 8: MAIN-world Highlight renderer (contenteditable / DOM text)

**Files:**
- Create: `extension/src/spellcheck/highlight-main.ts`
- Test: `extension/test/spell-highlight-locator.test.ts`
- Modify: `extension/manifest.json` (add a `world:"MAIN"` content script entry)

**Interfaces:**
- Produces:
  - `flagsToOffsets(host: HTMLElement, ranges: Token[]): Array<{ start: number; end: number }>` — pure helper mapping field-text offsets to ranges (unit-tested).
  - A MAIN-world listener: on `window` event `'pealim-spell-flags'` with `detail = { hostSelector?: string; offsets: {start,end}[] }`, it builds `Range`s against the focused editable and registers a `Highlight` under `CSS.highlights.set('pealim-misspelled', …)`, plus injects the `::highlight(pealim-misspelled)` style once.
- Consumes: `Token` from `./normalize`.

- [ ] **Step 1: Write the failing test (pure locator)**

Create `extension/test/spell-highlight-locator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { flagsToOffsets } from '../src/spellcheck/highlight-main';

describe('flagsToOffsets', () => {
  it('passes through start/end offsets for a single-text-node host', () => {
    const div = document.createElement('div');
    div.textContent = 'אני רוצה שלוום';
    expect(flagsToOffsets(div, [{ text: 'שלוום', start: 9, end: 14 }])).toEqual([
      { start: 9, end: 14 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run test/spell-highlight-locator.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

Create `extension/src/spellcheck/highlight-main.ts`:
```ts
import type { Token } from './normalize';

export function flagsToOffsets(
  _host: HTMLElement,
  ranges: Token[],
): Array<{ start: number; end: number }> {
  return ranges.map((r) => ({ start: r.start, end: r.end }));
}

// Walk a host's text nodes to resolve a character offset to (node, offset).
function locate(host: Node, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let n = walker.nextNode() as Text | null;
  while (n) {
    const len = n.data.length;
    if (offset <= seen + len) return { node: n, offset: offset - seen };
    seen += len;
    n = walker.nextNode() as Text | null;
  }
  return null;
}

const STYLE_ID = 'pealim-misspell-style';
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = '::highlight(pealim-misspelled){ text-decoration: red wavy underline; }';
  document.head.appendChild(s);
}

interface FlagDetail {
  offsets: Array<{ start: number; end: number }>;
}

function install(): void {
  if (typeof Highlight === 'undefined' || !('highlights' in CSS)) return; // overlay fallback handles it
  ensureStyle();
  window.addEventListener('pealim-spell-flags', (ev: Event) => {
    const detail = (ev as CustomEvent<FlagDetail>).detail;
    const host = document.activeElement as HTMLElement | null;
    if (!host || !detail) {
      CSS.highlights.delete('pealim-misspelled');
      return;
    }
    const ranges: Range[] = [];
    for (const o of detail.offsets) {
      const a = locate(host, o.start);
      const b = locate(host, o.end);
      if (!a || !b) continue;
      const r = document.createRange();
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
      ranges.push(r);
    }
    if (ranges.length) CSS.highlights.set('pealim-misspelled', new Highlight(...ranges));
    else CSS.highlights.delete('pealim-misspelled');
  });
}

install();
```

- [ ] **Step 4: Register the MAIN-world content script**

In `extension/manifest.json`, change `content_scripts` to include a second entry:
```json
"content_scripts": [
  { "matches": ["<all_urls>"], "js": ["src/content.ts"], "run_at": "document_idle" },
  { "matches": ["<all_urls>"], "js": ["src/spellcheck/highlight-main.ts"], "run_at": "document_idle", "world": "MAIN" }
]
```

- [ ] **Step 5: Run test + typecheck + build**

Run: `cd extension && npx vitest run test/spell-highlight-locator.test.ts && npm run typecheck && npm run build`
Expected: test PASS; typecheck clean; build emits the MAIN-world script.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "Add MAIN-world CSS Highlight renderer for contenteditable spell flags"
```

---

## Task 9: Controller — engagement, debounce, orchestration

**Files:**
- Create: `extension/src/spellcheck/controller.ts`
- Test: `extension/test/spell-controller.test.ts`

**Interfaces:**
- Consumes: `tokenizeHebrew`, `shouldSkip`, `stripDiacritics`, `Token` (`./normalize`); `loadUserDict`, `isEnabled` (`./userdict`); `ToWorker`/`FromWorker` (`./protocol`); `OverlayRenderer` (`./render-overlay`); `containsHebrew` (`../hebrew`).
- Produces:
  - `computeCandidates(text: string, userDict: Set<string>, ignore: Set<string>): { tokens: Token[]; norms: string[] }` — pure; the tokens to possibly flag and the unique normalized forms to send to the worker.
  - `class SpellController { start(): Promise<void>; stop(): void; }` — wires document listeners, the worker, and renderers.
- The controller dispatches MAIN-world flags via `window.dispatchEvent(new CustomEvent('pealim-spell-flags', { detail: { offsets } }))` for contenteditable, and uses `OverlayRenderer` for input/textarea.

- [ ] **Step 1: Write the failing test (pure candidate computation)**

Create `extension/test/spell-controller.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeCandidates } from '../src/spellcheck/controller';

describe('computeCandidates', () => {
  it('returns tokens to check + unique normalized forms, applying skip + user dict + ignore', () => {
    const text = 'שלום שלוום שלוום צה״ל אני';
    const { tokens, norms } = computeCandidates(text, new Set(['שלום']), new Set(['אני']));
    // 'שלום' is in userdict, 'צה״ל' is an acronym (skipped), 'אני' is ignored.
    // Remaining candidates: the two 'שלוום' occurrences.
    expect(tokens.map((t) => t.text)).toEqual(['שלוום', 'שלוום']);
    // normalized forms are deduped for the worker
    expect(norms).toEqual(['שלוום']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run test/spell-controller.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

Create `extension/src/spellcheck/controller.ts`:
```ts
import { tokenizeHebrew, shouldSkip, stripDiacritics, type Token } from './normalize';
import { loadUserDict, isEnabled } from './userdict';
import type { ToWorker, FromWorker } from './protocol';
import { OverlayRenderer } from './render-overlay';
import { containsHebrew } from '../hebrew';

export function computeCandidates(
  text: string,
  userDict: Set<string>,
  ignore: Set<string>,
): { tokens: Token[]; norms: string[] } {
  const tokens: Token[] = [];
  const norms: string[] = [];
  const seen = new Set<string>();
  for (const t of tokenizeHebrew(text)) {
    if (shouldSkip(t.text)) continue;
    const norm = stripDiacritics(t.text);
    if (userDict.has(norm) || ignore.has(norm)) continue;
    tokens.push(t);
    if (!seen.has(norm)) {
      seen.add(norm);
      norms.push(norm);
    }
  }
  return { tokens, norms };
}

const DEBOUNCE_MS = 500;
type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export class SpellController {
  private worker: Worker | null = null;
  private ready = false;
  private userDict = new Set<string>();
  private ignore = new Set<string>();
  private reqId = 0;
  private overlays = new WeakMap<HTMLElement, OverlayRenderer>();
  private timer: number | undefined;
  private pending = new Map<number, (m: FromWorker) => void>();

  async start(): Promise<void> {
    if (!(await isEnabled())) return;
    this.userDict = await loadUserDict();
    this.worker = new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onWorker(e.data);
    this.worker.onerror = (e) => console.error('[pealim] spell worker error:', e.message);
    this.post({
      type: 'init',
      affUrl: chrome.runtime.getURL('spelldata/he.aff'),
      dicUrl: chrome.runtime.getURL('spelldata/he.dic'),
    });
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('focusout', this.onFocusOut, true);
  }

  stop(): void {
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('focusout', this.onFocusOut, true);
    this.worker?.terminate();
    this.worker = null;
  }

  private post(msg: ToWorker): void {
    this.worker?.postMessage(msg);
  }

  private onWorker(m: FromWorker): void {
    if (m.type === 'ready') { this.ready = true; return; }
    if (m.type === 'error') { console.error('[pealim] spell engine:', m.message); return; }
    const cb = this.pending.get(m.id);
    if (cb) { this.pending.delete(m.id); cb(m); }
  }

  private check(tokens: string[]): Promise<string[]> {
    return new Promise((resolve) => {
      const id = ++this.reqId;
      this.pending.set(id, (m) => resolve(m.type === 'checked' ? m.misspelled : []));
      this.post({ type: 'check', id, tokens });
    });
  }

  private onInput = (e: Event): void => {
    const el = e.target as Editable | null;
    if (!el || !this.ready) return;
    const isTextField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    const text = isTextField ? el.value : (el as HTMLElement).isContentEditable ? (el as HTMLElement).innerText : null;
    if (text === null || !containsHebrew(text)) return; // engage only on Hebrew
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(el, text, isTextField), DEBOUNCE_MS);
  };

  private onFocusOut = (e: Event): void => {
    const el = e.target as HTMLElement | null;
    if (el && this.overlays.has(el)) this.overlays.get(el)!.clear();
  };

  private async run(el: Editable, text: string, isTextField: boolean): Promise<void> {
    const { tokens, norms } = computeCandidates(text, this.userDict, this.ignore);
    const misspelled = norms.length ? new Set(await this.check(norms)) : new Set<string>();
    const flagged = tokens.filter((t) => misspelled.has(stripDiacritics(t.text)));

    if (isTextField) {
      const field = el as HTMLInputElement | HTMLTextAreaElement;
      let ov = this.overlays.get(field);
      if (!ov) { ov = new OverlayRenderer(field); this.overlays.set(field, ov); }
      ov.mark(flagged);
    } else {
      window.dispatchEvent(
        new CustomEvent('pealim-spell-flags', {
          detail: { offsets: flagged.map((t) => ({ start: t.start, end: t.end })) },
        }),
      );
    }
  }
}
```

- [ ] **Step 4: Run test + typecheck to verify pass**

Run: `cd extension && npx vitest run test/spell-controller.test.ts && npm run typecheck`
Expected: test PASS; typecheck clean.

- [ ] **Step 5: In-browser verification (user-confirmed)**

Build, load unpacked. In a plain `<textarea>` and a `contenteditable` div, type Hebrew with a deliberate typo (e.g. `שלוום`). Confirm the word gets a red wavy underline after ~½s, and a correctly-spelled word does not. (Worker construction here is the real test of Task 6 Step 5 — if a CSP error blocks the worker, apply the offscreen fallback noted there.)

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "Add spell-check controller: engagement, debounce, worker orchestration"
```

---

## Task 10: Wire into content.ts, add popup toggle, full acceptance

**Files:**
- Modify: `extension/src/content.ts` (start the controller; handle flag clicks → suggestions popup → replace/lookup/add/ignore)
- Modify: `extension/src/popup.ts` is unrelated; the **toggle UI** lives in the browser-action popup. Create: `extension/popup.html` + `extension/src/action-popup.ts`; Modify: `extension/manifest.json` (`action.default_popup`)

**Interfaces:**
- Consumes: `SpellController` (`./spellcheck/controller`); `renderSuggestions` (`./spellcheck/suggest-popup`); `replaceInTextField`, `replaceInRange` (`./spellcheck/replace`); `addUserWord`, `isEnabled`, `setEnabled` (`./spellcheck/userdict`).

- [ ] **Step 1: Start the controller from content.ts**

In `extension/src/content.ts`, add near the top-level (after existing listeners):
```ts
import { SpellController } from './spellcheck/controller';
import { renderSuggestions } from './spellcheck/suggest-popup';
import { replaceInTextField, replaceInRange } from './spellcheck/replace';
import { addUserWord } from './spellcheck/userdict';

const spell = new SpellController();
void spell.start();
```

- [ ] **Step 2: Handle flag clicks → suggestion popup**

Still in `content.ts`, add a delegated click handler that detects a click on a `.pealim-misspell` mark (overlay) and opens the suggestion popup at the word. Add:
```ts
document.addEventListener('click', async (e) => {
  const mark = (e.target as HTMLElement | null)?.closest('.pealim-misspell') as HTMLElement | null;
  if (!mark) return;
  e.preventDefault();
  const word = mark.textContent ?? '';
  const rect = mark.getBoundingClientRect();
  const sugg = await spell.suggest(word); // see Step 3
  const node = renderSuggestions(word, sugg);
  showNode(node, rect);
  // wire actions inside the shadow popup
  node.addEventListener('click', (ev) => {
    const t = (ev as MouseEvent).target as HTMLElement;
    const pick = t.closest('button[data-suggest]') as HTMLElement | null;
    const act = t.closest('button[data-action]') as HTMLElement | null;
    if (pick) {
      const replacement = pick.dataset.suggest!;
      const field = document.activeElement;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        replaceInTextField(field, Number(mark.dataset.start), Number(mark.dataset.end), replacement);
      }
      dismiss();
    } else if (act?.dataset.action === 'lookup') {
      void lookupAndShow(word, rect);
    } else if (act?.dataset.action === 'add') {
      void addUserWord(word); dismiss();
    } else if (act?.dataset.action === 'ignore') {
      spell.ignoreWord(word); dismiss();
    }
  });
});
```

- [ ] **Step 3: Expose `suggest` + `ignoreWord` on the controller**

In `extension/src/spellcheck/controller.ts`, add public methods:
```ts
suggest(word: string): Promise<string[]> {
  return new Promise((resolve) => {
    if (!this.ready) return resolve([]);
    const id = ++this.reqId;
    this.pending.set(id, (m) => resolve(m.type === 'suggested' ? m.suggestions : []));
    this.post({ type: 'suggest', id, word });
  });
}
ignoreWord(word: string): void {
  this.ignore.add(word);
}
```

- [ ] **Step 4: Add the browser-action toggle popup**

Create `extension/popup.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8" />
<style>body{font:14px -apple-system,Arial,sans-serif;padding:12px;width:200px}label{display:flex;gap:8px;align-items:center}</style>
</head><body>
<label><input type="checkbox" id="toggle" /> Hebrew spell-check</label>
<script type="module" src="src/action-popup.ts"></script>
</body></html>
```
Create `extension/src/action-popup.ts`:
```ts
import { isEnabled, setEnabled } from './spellcheck/userdict';

const box = document.getElementById('toggle') as HTMLInputElement;
void (async () => { box.checked = await isEnabled(); })();
box.addEventListener('change', () => void setEnabled(box.checked));
```
In `extension/manifest.json`, add: `"action": { "default_popup": "popup.html" }`. In `vite.config.ts`, add `popup.html` to `rollupOptions.input` alongside `offscreen`.

- [ ] **Step 5: Full suite + typecheck + build**

Run: `cd extension && npm test && npm run typecheck && npm run build`
Expected: all unit tests PASS (existing + new), typecheck clean, build succeeds with `popup.html`, the MAIN-world script, the worker chunk, and `spelldata/`.

- [ ] **Step 6: In-browser acceptance (user-confirmed, per spec §11)**

Load `extension/dist` unpacked and confirm:
1. Type `שלוום` in a `<textarea>`, an `<input>`, and a `contenteditable` div → red wavy underline appears (~½s); fix it → underline clears.
2. Click an underlined word → popup with suggestions; click a suggestion → the field text is replaced and the host's input handler fires (caret restored).
3. "Look up in Pealim" opens the existing accordion lookup for that word.
4. "Add to my words" and "Ignore" both clear the flag; "Add" persists across reloads.
5. The browser-action toggle off → no flags anywhere; on → flags return.
6. A non-Hebrew field shows nothing. Google Docs (canvas) shows nothing (expected, documented limit).

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "Wire typing-assist into content script + add spell-check toggle popup"
```

---

## Self-Review

**Spec coverage:**
- §1 surfaces (input/textarea/contenteditable) → Tasks 7, 8, 9. Canvas out-of-scope → verified in Task 10 Step 6.6.
- §2 AGPLv3 + attribution → Task 1.
- §3 nspell + Hspell on-device, both flag + suggest → Tasks 1, 6, 9, 10.
- §4 normalize + skip rules (affix handled by nspell `.aff`) → Task 2.
- §5 file layout / data flow → all tasks; controller orchestration → Task 9.
- §6 MAIN-world Highlight + overlay + fallback → Tasks 7, 8 (fallback noted in Task 6 Step 5 / Task 8 `install()` guard).
- §7 activation (Hebrew-present) + toggle + user dict + replace + popup states → Tasks 3, 9, 10, 5.
- §8 internal worker messages + WAR + world:MAIN, no new Chrome perms → Tasks 6, 8.
- §9 resolved findings → reflected in design (no spike tasks needed).
- §10 No-Silent-Failures (every catch logs) → Tasks 3, 6, 9.
- §11 unit + manual tests → Tasks 2–9 unit; Task 10 manual checklist.
- §12 risks → addressed (parse-in-worker, debounce, ~1MB bundle).

**Placeholder scan:** no TBD/TODO; every code step has full code; the in-browser steps name exact actions and expected results.

**Type consistency:** `Token` (normalize) used unchanged in overlay/highlight/controller; `ToWorker`/`FromWorker` (protocol) used in worker + controller; `computeCandidates`/`check`/`suggest`/`ignoreWord` names match across Tasks 9–10; `el` exported from popup.ts and consumed in suggest-popup.ts.

**Note on Task 6/9 worker wiring:** the one genuine build risk (crxjs + MV3 worker construction) is verified in-browser at first use, with the proven offscreen-document pattern as a documented fallback that keeps the same message shapes.
