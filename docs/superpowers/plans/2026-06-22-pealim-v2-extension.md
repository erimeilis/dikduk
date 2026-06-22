# Pealim v2 — Extension Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Update the Chrome extension to consume the v2 Worker contract and present an **accordion popup** (Active default-open, Passive and See-also shown only when present) plus a **single context-menu "Look up" trigger** so lookups work on links.

**Architecture:** The popup becomes one accordion built from the v2 `LookupResult` using native `<details>/<summary>` sections (no toggle JS). Both triggers — double-click and the new context-menu item — open the same popup. The double-click flow is unchanged except that `renderPopup` now builds the accordion; the context-menu flow adds a background `onClicked` handler that looks the word up and pushes a `render` message to the content script.

**Tech Stack:** TypeScript, Vite + @crxjs/vite-plugin (MV3), Vitest + happy-dom. Builds on the v2 Worker (same branch `feature/pealim-v2-worker`).

## Global Constraints

- v2 contract (mirror the Worker's, in `extension/src/types.ts`): `LookupResult { word, lemma, slug, translation, root, isVerb, voices?: { active?: Voice; passive?: Voice }, seeAlso: SeeAlsoRef[], sourceUrl }`; `Voice { binyan: string | null; forms: Conjugation }`; `SeeAlsoRef { label: string; slug: string }`; `Conjugation` keys unchanged (present {ms,fs,mp,fp}; past {…,**3p**}; future {…,**3mp,3fp**}; imperative {2ms,2fs,2mp,2fp}; infinitive). Flat v1 `conjugation`/`binyan` removed.
- **Accordion popup:** header (lemma + translation + `root …`) always; an **Active** `<details open>` section when `voices.active` exists; a **Passive** `<details>` (collapsed) only when `voices.passive` exists; a **See also (N)** `<details>` (collapsed) only when `seeAlso.length > 0`. **Sections absent → not rendered** (this is the "hide if none" rule). A plain noun shows header (+ See also if present), no tables.
- Matrix renderer **skips fully-empty rows** (Pu'al passive has empty imperative + infinitive). Cells are vocalized Hebrew (already provided by the Worker).
- See-also links → `https://www.pealim.com/dict/<slug>/`, `target=_blank rel=noopener`; the source-link href keeps the v1 `^https?://` guard.
- **Single** context-menu item `Look up "%s" in Pealim`, `contexts: ['selection']`; requires the `contextMenus` permission. Non-Hebrew selection → a friendly "Select a Hebrew word" popup (no network call).
- Double-click behavior otherwise unchanged (Hebrew-gated, Shadow-DOM popup, viewport positioning, outside-click/Esc dismiss, the v1 `display:block` solid card).
- No Silent Failures: messaging/lookup failures surface in the popup AND log with context.
- Branch `feature/pealim-v2-worker` (already holds the v2 worker). `git add .`; compact commit messages, **no AI attribution**. Install latest deps; don't pin from memory. Never deploy without explicit user approval.

---

## File Structure

```
extension/
├── manifest.json          # MODIFY — +"contextMenus" permission
└── src/
    ├── types.ts           # MODIFY — v2 contract mirror + RenderMessage
    ├── popup.ts           # MODIFY — accordion (details sections), skip-empty rows, see-also
    ├── content.ts         # MODIFY — render-message listener + last-pointer tracking
    └── background.ts      # MODIFY — context-menu create + onClicked → render
```
(Unchanged: `hebrew.ts`, `position.ts`, `cache-key.ts`, `config.ts` — already tested in v1.)

---

## Task 1: Extension v2 types

**Files:** Modify `extension/src/types.ts`; Test `extension/test/types-v2.test.ts` (new).

**Interfaces:** Produces v2 `Conjugation`, `Voice`, `SeeAlsoRef`, `LookupResult`, `LookupError`, `LookupResponse`, `LookupMessage`, `RenderMessage`, `isLookupError`.

- [ ] **Step 1: Verify the branch**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git branch --show-current   # must be feature/pealim-v2-worker
```

- [ ] **Step 2: Replace `extension/src/types.ts`**
```ts
export interface Conjugation {
  present: { ms: string; fs: string; mp: string; fp: string };
  past: {
    '1s': string; '1p': string;
    '2ms': string; '2fs': string; '2mp': string; '2fp': string;
    '3ms': string; '3fs': string; '3p': string;
  };
  future: {
    '1s': string; '1p': string;
    '2ms': string; '2fs': string; '2mp': string; '2fp': string;
    '3ms': string; '3fs': string; '3mp': string; '3fp': string;
  };
  imperative: { '2ms': string; '2fs': string; '2mp': string; '2fp': string };
  infinitive: string;
}

export interface Voice {
  binyan: string | null;
  forms: Conjugation;
}

export interface SeeAlsoRef {
  label: string;
  slug: string;
}

export interface LookupResult {
  word: string;
  lemma: string;
  slug: string;
  translation: string;
  root: string;
  isVerb: boolean;
  voices?: { active?: Voice; passive?: Voice };
  seeAlso: SeeAlsoRef[];
  sourceUrl: string;
}

export interface LookupError {
  error: string;
  code: 'NO_RESULTS' | 'UPSTREAM' | 'PARSE';
}

export type LookupResponse = LookupResult | LookupError;

export interface LookupMessage {
  type: 'lookup';
  word: string;
}

export interface RenderMessage {
  type: 'render';
  data: LookupResponse;
}

export function isLookupError(r: LookupResponse): r is LookupError {
  return (r as LookupError).code !== undefined;
}
```

- [ ] **Step 3: Write `extension/test/types-v2.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { isLookupError } from '../src/types';
import type { LookupResult } from '../src/types';

describe('v2 types', () => {
  it('composes a verb result with voices + seeAlso', () => {
    const r: LookupResult = {
      word: 'x', lemma: 'x', slug: '1-x', translation: 't', root: 'r', isVerb: true,
      voices: { active: { binyan: "Pi'el", forms: {} as any }, passive: { binyan: "Pu'al", forms: {} as any } },
      seeAlso: [{ label: 'y', slug: '2-y' }],
      sourceUrl: 'https://www.pealim.com/dict/1-x/',
    };
    expect(r.voices?.passive?.binyan).toBe("Pu'al");
    expect(isLookupError(r)).toBe(false);
  });
  it('detects errors', () => {
    expect(isLookupError({ error: 'e', code: 'NO_RESULTS' })).toBe(true);
  });
});
```

- [ ] **Step 4: Run** — `cd extension && npm test -- types-v2 && npm run typecheck`
Expected: types-v2 test passes. NOTE: `popup.ts`/`content.ts` still use the v1 contract and will have type errors until Tasks 2–3 — that is expected; `types.ts` + `types-v2.test.ts` are clean. Report typecheck honestly (which files error). Do NOT touch popup/content here.

- [ ] **Step 5: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Mirror v2 contract in extension types"
```

---

## Task 2: Accordion popup

**Files:** Modify `extension/src/popup.ts`; Modify `extension/test/popup.test.ts`.

**Interfaces:** Consumes `LookupResponse`, `LookupResult`, `Conjugation`, `SeeAlsoRef`, `isLookupError`. Produces `renderPopup(data: LookupResponse): HTMLElement`, `renderLoading(word: string): HTMLElement`, `POPUP_CSS: string`.

- [ ] **Step 1: Replace `extension/test/popup.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { renderPopup } from '../src/popup';
import type { Conjugation, LookupResult } from '../src/types';

const activeForms: Conjugation = {
  present: { ms: 'מְבַקֵּשׁ', fs: 'מְבַקֶּשֶׁת', mp: 'מְבַקְשִׁים', fp: 'מְבַקְשׁוֹת' },
  past: { '1s': 'בִּקַּשְׁתִּי', '1p': 'בִּקַּשְׁנוּ', '2ms': 'בִּקַּשְׁתָּ', '2fs': 'בִּקַּשְׁתְּ', '2mp': 'בִּקַּשְׁתֶּם', '2fp': 'בִּקַּשְׁתֶּן', '3ms': 'בִּקֵּשׁ', '3fs': 'בִּקְּשָׁה', '3p': 'בִּקְּשׁוּ' },
  future: { '1s': 'אֲבַקֵּשׁ', '1p': 'נְבַקֵּשׁ', '2ms': 'תְּבַקֵּשׁ', '2fs': 'תְּבַקְשִׁי', '2mp': 'תְּבַקְשׁוּ', '2fp': 'תְּבַקֵּשְׁנָה', '3ms': 'יְבַקֵּשׁ', '3fs': 'תְּבַקֵּשׁ', '3mp': 'יְבַקְשׁוּ', '3fp': 'תְּבַקֵּשְׁנָה' },
  imperative: { '2ms': 'בַּקֵּשׁ', '2fs': 'בַּקְשִׁי', '2mp': 'בַּקְשׁוּ', '2fp': 'בַּקֵּשְׁנָה' },
  infinitive: 'לְבַקֵּשׁ',
};
// Pu'al passive: no imperative, no infinitive
const passiveForms: Conjugation = {
  present: { ms: 'מְבֻקָּשׁ', fs: 'מְבֻקֶּשֶׁת', mp: 'מְבֻקָּשִׁים', fp: 'מְבֻקָּשׁוֹת' },
  past: { '1s': 'בֻּקַּשְׁתִּי', '1p': 'בֻּקַּשְׁנוּ', '2ms': 'בֻּקַּשְׁתָּ', '2fs': 'בֻּקַּשְׁתְּ', '2mp': 'בֻּקַּשְׁתֶּם', '2fp': 'בֻּקַּשְׁתֶּן', '3ms': 'בֻּקַּשׁ', '3fs': 'בֻּקְּשָׁה', '3p': 'בֻּקְּשׁוּ' },
  future: { '1s': 'אֲבֻקַּשׁ', '1p': 'נְבֻקַּשׁ', '2ms': 'תְּבֻקַּשׁ', '2fs': 'תְּבֻקְּשִׁי', '2mp': 'תְּבֻקְּשׁוּ', '2fp': 'תְּבֻקַּשְׁנָה', '3ms': 'יְבֻקַּשׁ', '3fs': 'תְּבֻקַּשׁ', '3mp': 'יְבֻקְּשׁוּ', '3fp': 'תְּבֻקַּשְׁנָה' },
  imperative: { '2ms': '', '2fs': '', '2mp': '', '2fp': '' },
  infinitive: '',
};
const verb: LookupResult = {
  word: 'לבקש', lemma: 'לְבַקֵּשׁ', slug: '255-levakesh', translation: 'to ask, to request', root: 'ב־ק־שׁ',
  isVerb: true,
  voices: { active: { binyan: "Pi'el", forms: activeForms }, passive: { binyan: "Pu'al", forms: passiveForms } },
  seeAlso: [{ label: 'בַּקָּשָׁה', slug: '3000-bakasha' }, { label: 'בִּיקּוּשׁ', slug: '2955-bikush' }],
  sourceUrl: 'https://www.pealim.com/dict/255-levakesh/',
};
const noun: LookupResult = {
  word: 'מבוקש', lemma: 'מְבוּקָּשׁ', slug: '9321-mevukash', translation: 'wanted, required', root: 'ב־ק־שׁ',
  isVerb: false, seeAlso: [], sourceUrl: 'https://www.pealim.com/dict/9321-mevukash/',
};

describe('renderPopup accordion', () => {
  it('renders header + Active(open) + Passive + See also for a verb', () => {
    const el = renderPopup(verb);
    expect(el.getAttribute('dir')).toBe('rtl');
    expect(el.textContent).toContain('לְבַקֵּשׁ');
    expect(el.textContent).toContain('to ask, to request');
    expect(el.textContent).toContain('ב־ק־שׁ');
    const sections = el.querySelectorAll('details');
    expect(sections.length).toBe(3); // active, passive, see-also
    // Active section is open and has a matrix with present.ms
    const active = sections[0];
    expect(active.hasAttribute('open')).toBe(true);
    expect(active.querySelector('summary')?.textContent).toContain("Pi'el");
    expect(active.querySelector('table')).not.toBeNull();
    expect(active.textContent).toContain('מְבַקֵּשׁ');
    // Passive section present, collapsed, labelled Pu'al
    const passive = sections[1];
    expect(passive.hasAttribute('open')).toBe(false);
    expect(passive.querySelector('summary')?.textContent).toContain("Pu'al");
    expect(passive.textContent).toContain('מְבֻקָּשׁ');
    // See also section lists links to /dict/<slug>/
    const see = sections[2];
    expect(see.querySelector('summary')?.textContent).toContain('See also');
    const links = Array.from(see.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('https://www.pealim.com/dict/3000-bakasha/');
  });

  it('skips empty rows: passive matrix has no imperative/infinitive rows', () => {
    const el = renderPopup(verb);
    const passive = el.querySelectorAll('details')[1];
    expect(passive.textContent).not.toContain('Imperative');
    expect(passive.textContent).not.toContain('Infinitive');
    // active still has them
    const active = el.querySelectorAll('details')[0];
    expect(active.textContent).toContain('Imperative');
    expect(active.textContent).toContain('Infinitive');
  });

  it('renders only the header for a non-verb with no see-also', () => {
    const el = renderPopup(noun);
    expect(el.textContent).toContain('מְבוּקָּשׁ');
    expect(el.textContent).toContain('wanted, required');
    expect(el.querySelector('details')).toBeNull();
    expect(el.querySelector('table')).toBeNull();
  });

  it('renders an error', () => {
    const el = renderPopup({ error: 'No Pealim entry for «xyz»', code: 'NO_RESULTS' });
    expect(el.classList.contains('pealim-error')).toBe(true);
    expect(el.textContent).toContain('No Pealim entry');
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `cd extension && npm test -- popup`
Expected: FAIL (v1 popup renders flat conjugation; no `details`).

- [ ] **Step 3: Replace `extension/src/popup.ts`**
```ts
import { type LookupResponse, type LookupResult, type Conjugation, isLookupError } from './types';

export const POPUP_CSS = `
.pealim-popup {
  all: initial;
  display: block;
  box-sizing: border-box;
  width: max-content;
  max-width: 360px;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  direction: rtl; text-align: right;
  background: #ffffff; color: #1a1a1a;
  border: 1px solid #d0d0d0; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  padding: 10px 12px; font-size: 15px; line-height: 1.4;
}
.pealim-popup .pealim-lemma { font-size: 20px; font-weight: 700; }
.pealim-popup .pealim-translation { margin-top: 2px; color: #333; }
.pealim-popup .pealim-meta { margin-top: 4px; font-size: 13px; color: #666; }
.pealim-popup details { margin-top: 8px; border-top: 1px solid #eee; padding-top: 4px; }
.pealim-popup summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #555; list-style: none; padding: 2px 0; }
.pealim-popup summary::-webkit-details-marker { display: none; }
.pealim-popup summary::before { content: "▸ "; }
.pealim-popup details[open] > summary::before { content: "▾ "; }
.pealim-popup table { border-collapse: collapse; margin-top: 6px; width: 100%; }
.pealim-popup th, .pealim-popup td { border: 1px solid #e3e3e3; padding: 3px 6px; text-align: center; font-size: 14px; }
.pealim-popup th { background: #f5f5f5; font-weight: 600; font-size: 12px; color: #555; }
.pealim-popup td.pealim-rowlabel { background: #fafafa; font-size: 12px; color: #555; }
.pealim-popup .pealim-seealso { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.pealim-popup .pealim-seealso a { color: #2563eb; text-decoration: none; font-size: 14px; }
.pealim-popup .pealim-source { margin-top: 8px; font-size: 12px; }
.pealim-popup .pealim-source a { color: #2563eb; text-decoration: none; }
.pealim-popup.pealim-error { color: #b00020; }
.pealim-popup.pealim-loading { color: #666; }
`;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cell(tag: 'td' | 'th', text: string, span = 1, cls = ''): HTMLTableCellElement {
  const c = document.createElement(tag);
  c.textContent = text;
  if (span > 1) c.colSpan = span;
  if (cls) c.className = cls;
  return c;
}

function buildMatrix(forms: Conjugation): HTMLTableElement {
  const table = document.createElement('table');

  const h1 = document.createElement('tr');
  h1.appendChild(cell('th', ''));
  h1.appendChild(cell('th', 'Singular', 2));
  h1.appendChild(cell('th', 'Plural', 2));
  const h2 = document.createElement('tr');
  h2.appendChild(cell('th', ''));
  h2.appendChild(cell('th', 'M')); h2.appendChild(cell('th', 'F'));
  h2.appendChild(cell('th', 'M')); h2.appendChild(cell('th', 'F'));
  table.appendChild(h1); table.appendChild(h2);

  const row = (label: string, cells: { text: string; span?: number }[]) => {
    if (cells.every((c) => !c.text)) return; // skip a fully-empty row (e.g. Pu'al imperative/infinitive)
    const tr = document.createElement('tr');
    tr.appendChild(cell('td', label, 1, 'pealim-rowlabel'));
    for (const c of cells) tr.appendChild(cell('td', c.text, c.span ?? 1));
    table.appendChild(tr);
  };

  row('Present', [{ text: forms.present.ms }, { text: forms.present.fs }, { text: forms.present.mp }, { text: forms.present.fp }]);
  row('Past 1', [{ text: forms.past['1s'], span: 2 }, { text: forms.past['1p'], span: 2 }]);
  row('Past 2', [{ text: forms.past['2ms'] }, { text: forms.past['2fs'] }, { text: forms.past['2mp'] }, { text: forms.past['2fp'] }]);
  row('Past 3', [{ text: forms.past['3ms'] }, { text: forms.past['3fs'] }, { text: forms.past['3p'], span: 2 }]);
  row('Future 1', [{ text: forms.future['1s'], span: 2 }, { text: forms.future['1p'], span: 2 }]);
  row('Future 2', [{ text: forms.future['2ms'] }, { text: forms.future['2fs'] }, { text: forms.future['2mp'] }, { text: forms.future['2fp'] }]);
  row('Future 3', [{ text: forms.future['3ms'] }, { text: forms.future['3fs'] }, { text: forms.future['3mp'] }, { text: forms.future['3fp'] }]);
  row('Imperative', [{ text: forms.imperative['2ms'] }, { text: forms.imperative['2fs'] }, { text: forms.imperative['2mp'] }, { text: forms.imperative['2fp'] }]);
  row('Infinitive', [{ text: forms.infinitive, span: 4 }]);

  return table;
}

function detailsSection(title: string, body: HTMLElement, open: boolean): HTMLElement {
  const d = document.createElement('details');
  if (open) d.open = true;
  const s = document.createElement('summary');
  s.textContent = title;
  d.appendChild(s);
  d.appendChild(body);
  return d;
}

function buildSeeAlso(refs: { label: string; slug: string }[]): HTMLElement {
  const box = el('div', 'pealim-seealso');
  for (const r of refs) {
    const a = document.createElement('a');
    a.href = `https://www.pealim.com/dict/${r.slug}/`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = r.label;
    box.appendChild(a);
  }
  return box;
}

export function renderPopup(data: LookupResponse): HTMLElement {
  const wrap = el('div', 'pealim-popup');
  wrap.setAttribute('dir', 'rtl');

  if (isLookupError(data)) {
    wrap.classList.add('pealim-error');
    wrap.appendChild(el('div', 'pealim-errmsg', data.error));
    return wrap;
  }

  wrap.appendChild(el('div', 'pealim-lemma', data.lemma || data.word));
  if (data.translation) wrap.appendChild(el('div', 'pealim-translation', data.translation));
  if (data.root) wrap.appendChild(el('div', 'pealim-meta', `root ${data.root}`));

  const active = data.voices?.active;
  if (active) {
    const title = active.binyan ? `Active · ${active.binyan}` : 'Active';
    wrap.appendChild(detailsSection(title, buildMatrix(active.forms), true));
  }
  const passive = data.voices?.passive;
  if (passive) {
    const title = passive.binyan ? `Passive · ${passive.binyan}` : 'Passive';
    wrap.appendChild(detailsSection(title, buildMatrix(passive.forms), false));
  }
  if (data.seeAlso.length) {
    wrap.appendChild(detailsSection(`See also (${data.seeAlso.length})`, buildSeeAlso(data.seeAlso), false));
  }

  const src = el('div', 'pealim-source');
  const a = document.createElement('a');
  if (/^https?:\/\//i.test(data.sourceUrl)) a.href = data.sourceUrl;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Pealim ↗';
  src.appendChild(a);
  wrap.appendChild(src);
  return wrap;
}

export function renderLoading(word: string): HTMLElement {
  const wrap = el('div', 'pealim-popup pealim-loading');
  wrap.setAttribute('dir', 'rtl');
  wrap.appendChild(el('div', undefined, `…${word}`));
  return wrap;
}
```

- [ ] **Step 4: Run tests + typecheck** — `cd extension && npm test -- popup && npm run typecheck`
Expected: 4 popup tests PASS; `popup.ts` typechecks. (`content.ts` may still error until Task 3 — note it; do not touch content.ts here.)

- [ ] **Step 5: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Render accordion popup (Active/Passive/See-also) from v2 contract"
```

---

## Task 3: Content script — render-message + pointer

**Files:** Modify `extension/src/content.ts`. (No automated test — DOM/Chrome APIs; verified manually in Task 5. The helpers it composes are already tested.)

**Interfaces:** Consumes `renderPopup`, `LookupResponse`. The existing dblclick handler is unchanged (it already calls `renderPopup`, now the accordion).

- [ ] **Step 1: Add the render listener + pointer tracking to `extension/src/content.ts`**
At the top, ensure the type import includes `LookupResponse` (it already imports from `./types`). Then append, after the existing `keydown`/`mousedown` dismiss listeners:
```ts
// Context-menu lookups arrive as a 'render' message from the background worker.
let lastPointer = { x: 0, y: 0 };
document.addEventListener(
  'contextmenu',
  (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
  },
  true,
);

chrome.runtime.onMessage.addListener((msg: { type?: string; data?: LookupResponse }) => {
  if (msg?.type !== 'render' || !msg.data) return;
  const sel = window.getSelection();
  let anchor: DOMRect;
  if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
    anchor = sel.getRangeAt(0).getBoundingClientRect();
  } else {
    anchor = new DOMRect(lastPointer.x, lastPointer.y, 0, 0);
  }
  showNode(renderPopup(msg.data), anchor);
});
```
(`showNode` and `renderPopup` already exist in the file. If `LookupResponse` is not yet imported, add it to the existing `import type { … } from './types';` line.)

- [ ] **Step 2: Typecheck + build** — `cd extension && npm run typecheck && npm run build`
Expected: tsc clean across the extension now; `dist/manifest.json` produced. (Existing helper tests still pass: `npm test`.)

- [ ] **Step 3: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Content script handles context-menu render messages"
```

---

## Task 4: Background — context-menu trigger

**Files:** Modify `extension/src/background.ts`, `extension/manifest.json`. (No automated test — Chrome `contextMenus`/`tabs` APIs; verified manually in Task 5.)

**Interfaces:** Consumes `fetchLookup` (existing in background.ts), `containsHebrew`/`extractWord` (`./hebrew`).

- [ ] **Step 1: Add `"contextMenus"` to `extension/manifest.json` permissions**
Change `"permissions": ["storage"]` to:
```json
"permissions": ["storage", "contextMenus"],
```

- [ ] **Step 2: Add the context menu to `extension/src/background.ts`**
At the top, add the import:
```ts
import { containsHebrew, extractWord } from './hebrew';
```
At the end of the file (after the existing `chrome.runtime.onMessage` listener), append:
```ts
const MENU_ID = 'pealim-lookup';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Look up “%s” in Pealim',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const word = extractWord(info.selectionText ?? '');
  const data = !word || !containsHebrew(word)
    ? { error: 'Select a Hebrew word to look up.', code: 'NO_RESULTS' as const }
    : await fetchLookup(word);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'render', data });
  } catch (e) {
    console.error('[pealim] could not deliver lookup result to tab:', e);
  }
});
```

- [ ] **Step 3: Typecheck + build** — `cd extension && npm run typecheck && npm run build`
Expected: tsc clean; `dist/` built with the `contextMenus` permission in `dist/manifest.json`.

- [ ] **Step 4: Commit**
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Add context-menu Look up trigger (works on links)"
```

---

## Task 5: Build + local end-to-end verification (user-confirmed)

> Correctness of the in-browser experience is confirmed by the user observing it — not claimed without that confirmation.

- [ ] **Step 1: Full extension checks** — `cd extension && npm run typecheck && npm test && npm run build`
Expected: typecheck clean; helper + popup + types tests green; `extension/dist/manifest.json` present with `"contextMenus"`.

- [ ] **Step 2: Ensure the v2 Worker is running locally**
`cd worker && npm run db:migrate:local && npm run dev` (local D1; `http://localhost:8787`). `extension/src/config.ts` `WORKER_URL` already points there.

- [ ] **Step 3: Reload the extension + a Hebrew page** (user performs)
`chrome://extensions` → reload the **Pealim Hebrew Lookup** card → reload the Hebrew page tab.

- [ ] **Step 4: Manual acceptance** (user confirms — do not claim success without it)
- Double-click a **Pi'el verb** (e.g. לבקש after it's freshly looked up, or לדבר) → popup: header + **Active** (open, Pi'el matrix) + **Passive** (collapsed, Pu'al — expand it; no Imperative/Infinitive rows) + **See also (N)** (collapsed; expand → links).
- Double-click a **noun/adjective** → header + translation + root only (no tables), See-also if present.
- **Select a Hebrew word inside a link, right-click → "Look up … in Pealim"** → same accordion popup appears (this is the links fix).
- Esc / outside-click dismiss; sections expand/collapse.

- [ ] **Step 5: Commit any config touched** (only if changed)
```bash
cd /Volumes/Annette/IdeaProjects/pealim && git add . && git commit -m "Extension v2 verified locally"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** accordion popup (header + Active default-open + Passive-if-present + See-also-if-present, hide-empty via not rendering) → Task 2; matrix skip-empty-rows (Pu'al) → Task 2; single context-menu "Look up" trigger + contextMenus permission + non-Hebrew guard → Task 4; render-message path + works-on-links → Tasks 3–4; v2 contract mirror → Task 1; double-click unchanged → Tasks 2–3; No-Silent-Failures (error popup + log) → Tasks 2–4. Crawler/stats/seeder/fallback/audio remain deferred (their own specs).
- **Placeholder scan:** no TBD/TODO; every code step is complete.
- **Type consistency:** `LookupResult`/`Voice`/`SeeAlsoRef`/`Conjugation`/`RenderMessage` defined in Task 1 and consumed verbatim in Tasks 2–4; `renderPopup`/`renderLoading`/`POPUP_CSS` signatures consistent between Task 2 and the content script in Task 3; conjugation key sets match the worker contract (past `3p`; future `3mp`+`3fp`).
- **Testing-stack note:** popup rendering is unit-tested (happy-dom); content/background Chrome-API code is verified by the user in Task 5 (consistent with v1), composing already-tested pure helpers.
```
