import { containsHebrew, extractWord } from './shared/hebrew';
import { computePosition } from './position';
import { renderPopup, renderLoading, renderChips, renderOcrLoading } from './lookup/render-popup';
import { POPUP_CSS } from './lookup/popup.css';
import type { LookupResponse } from './contracts/lookup';
import { SpellController } from './spellcheck/controller';
import { renderSuggestions } from './spellcheck/suggest-popup';
import { renderGrammarIssue } from './spellcheck/grammar-popup';
import { replaceInRange, replaceInTextField } from './spellcheck/replace';
import { addUserWord } from './spellcheck/userdict';

const spell = new SpellController();
void spell.start();

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let lastPointer = { x: 0, y: 0 };
let lastAnchor: DOMRect | null = null;

function ensureHost(): ShadowRoot {
  if (host && shadow) return shadow;
  host = document.createElement('div');
  host.style.cssText = 'position:absolute;z-index:2147483647;top:0;left:0;';
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = POPUP_CSS;
  shadow.appendChild(style);
  shadow.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest('.dikduk-seealso-link, .dikduk-chip') as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const word = target.dataset.word;
    if (word) void lookupAndShow(word, lastAnchor ?? new DOMRect(lastPointer.x, lastPointer.y, 0, 0));
  });
  document.body.appendChild(host);
  return shadow;
}

function dismiss(): void {
  if (host) {
    host.remove();
    host = null;
    shadow = null;
  }
}

function showNode(node: HTMLElement, anchor: DOMRect): void {
  const root = ensureHost();
  root.querySelectorAll('.dikduk-popup').forEach((n) => n.remove());
  root.appendChild(node);

  const size = node.getBoundingClientRect();
  const pos = computePosition(
    { left: anchor.left, top: anchor.top, right: anchor.right, bottom: anchor.bottom },
    { width: size.width || 360, height: size.height || 200 },
    { width: window.innerWidth, height: window.innerHeight },
  );
  host!.style.left = `${pos.left + window.scrollX}px`;
  host!.style.top = `${pos.top + window.scrollY}px`;
}

async function lookupAndShow(word: string, anchor: DOMRect): Promise<void> {
  lastAnchor = anchor;
  showNode(renderLoading(word), anchor);
  try {
    const data = (await chrome.runtime.sendMessage({ type: 'lookup', word })) as LookupResponse;
    showNode(renderPopup(data), anchor);
  } catch (e) {
    console.error('[dikduk] messaging failed:', e);
    showNode(renderPopup({ error: `Lookup failed: ${(e as Error).message}`, code: 'UPSTREAM' }), anchor);
  }
}

document.addEventListener('dblclick', async () => {
  const sel = window.getSelection();
  const text = sel?.toString() ?? '';
  if (!sel || sel.rangeCount === 0 || !text || !containsHebrew(text)) return;

  const word = extractWord(text);
  if (!word) return;

  const range = sel.getRangeAt(0);
  const anchor = range.getBoundingClientRect();

  await lookupAndShow(word, anchor);
});

document.addEventListener('mousedown', (e) => {
  if (host && !e.composedPath().includes(host)) dismiss();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismiss();
});
document.addEventListener('input', (e) => {
  const target = e.target as HTMLElement | null;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable
    || target?.closest('[contenteditable]')
  ) {
    dismiss();
  }
}, true);

// Context-menu lookups arrive as a 'render' message from the background worker.
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
  lastAnchor = anchor;
  showNode(renderPopup(msg.data), anchor);
});

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

document.addEventListener('click', async (e) => {
  const hit = spell.findFlagAtClick(e as MouseEvent);
  if (hit) {
    e.preventDefault();
    const word = hit.word;
    const rect = hit.rect;
    const sugg = await spell.suggest(word);
    const node = renderSuggestions(word, sugg);
    showNode(node, rect);
    // wire actions inside the shadow popup
    node.addEventListener('click', (ev) => {
      const t = (ev as MouseEvent).target as HTMLElement;
      const pick = t.closest('button[data-suggest]') as HTMLElement | null;
      const act = t.closest('button[data-action]') as HTMLElement | null;
      if (pick) {
        const replacement = pick.dataset.suggest!;
        if (hit.isTextField) {
          replaceInTextField(hit.field as HTMLInputElement | HTMLTextAreaElement, hit.start, hit.end, replacement);
        } else if (hit.range) {
          replaceInRange(hit.range, replacement);
        }
        dismiss();
      } else if (act?.dataset.action === 'lookup') {
        void lookupAndShow(word, rect);
      } else if (act?.dataset.action === 'add') {
        void addUserWord(word);
        spell.rememberUserWord(word);
        spell.rescan(hit.field);
        dismiss();
      } else if (act?.dataset.action === 'ignore') {
        spell.ignoreWord(word);
        spell.rescan(hit.field);
        dismiss();
      }
    });
    return;
  }

  const grammarHit = spell.findGrammarAtClick(e as MouseEvent);
  if (!grammarHit) return;
  e.preventDefault();
  const text = grammarHit.isTextField
    ? (grammarHit.field as HTMLInputElement | HTMLTextAreaElement).value
    : (grammarHit.field as HTMLElement).textContent ?? '';
  showNode(renderGrammarIssue(grammarHit.issue, text), grammarHit.rect);
});
