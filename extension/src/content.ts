import { containsHebrew, extractWord } from './hebrew';
import { computePosition } from './position';
import { renderPopup, renderLoading, POPUP_CSS } from './popup';
import type { LookupMessage, LookupResponse } from './types';

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;

function ensureHost(): ShadowRoot {
  if (host && shadow) return shadow;
  host = document.createElement('div');
  host.style.cssText = 'position:absolute;z-index:2147483647;top:0;left:0;';
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = POPUP_CSS;
  shadow.appendChild(style);
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
  root.querySelectorAll('.pealim-popup').forEach((n) => n.remove());
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

document.addEventListener('dblclick', async () => {
  const sel = window.getSelection();
  const text = sel?.toString() ?? '';
  if (!sel || sel.rangeCount === 0 || !text || !containsHebrew(text)) return;

  const word = extractWord(text);
  if (!word) return;

  const range = sel.getRangeAt(0);
  const anchor = range.getBoundingClientRect();

  showNode(renderLoading(word), anchor);

  try {
    const msg: LookupMessage = { type: 'lookup', word };
    const data = (await chrome.runtime.sendMessage(msg)) as LookupResponse;
    showNode(renderPopup(data), anchor);
  } catch (e) {
    console.error('[pealim] messaging failed:', e);
    showNode(renderPopup({ error: `Lookup failed: ${(e as Error).message}`, code: 'UPSTREAM' }), anchor);
  }
});

document.addEventListener('mousedown', (e) => {
  if (host && !e.composedPath().includes(host)) dismiss();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismiss();
});
