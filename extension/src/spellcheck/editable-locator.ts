// Pure DOM walking for editable fields (inputs, textareas, contenteditable hosts).
// Resolves click points / selections to character offsets and builds ranges from
// offsets. No chrome.*, no controller state. Builds on shared/dom-offsets.ts.
import { rangeFromOffsets } from '../shared/dom-offsets';

export type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export { rangeFromOffsets };

export function normalizeEditable(el: Editable | null): Editable | null {
  if (!el) return null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  return findContentEditableHost(el);
}

export function findContentEditableHost(el: HTMLElement): HTMLElement | null {
  if (isContentEditable(el)) return el;
  return el.closest('[contenteditable]') as HTMLElement | null;
}

export function isContentEditable(el: HTMLElement): boolean {
  const attr = el.getAttribute('contenteditable');
  return el.isContentEditable || attr === '' || attr === 'true';
}

export function currentText(el: Editable, isTextField: boolean): string | null {
  return isTextField
    ? (el as HTMLInputElement | HTMLTextAreaElement).value
    : el instanceof HTMLElement && isContentEditable(el)
      ? el.textContent
      : null;
}

export function pointRect(e: MouseEvent, fallback: HTMLElement): DOMRect {
  if (e.clientX || e.clientY) return new DOMRect(e.clientX, e.clientY, 0, 0);
  return fallback.getBoundingClientRect();
}

export function offsetFromPoint(host: HTMLElement, x: number, y: number): number | null {
  const doc = host.ownerDocument;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position && host.contains(position.offsetNode)) {
    return textOffsetWithin(host, position.offsetNode, position.offset);
  }

  const range = doc.caretRangeFromPoint?.(x, y);
  if (range && host.contains(range.startContainer)) {
    return textOffsetWithin(host, range.startContainer, range.startOffset);
  }

  return null;
}

export function offsetFromSelection(host: HTMLElement): number | null {
  const selection = host.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!host.contains(range.startContainer)) return null;
  return textOffsetWithin(host, range.startContainer, range.startOffset);
}

function textOffsetWithin(host: HTMLElement, node: Node, offset: number): number | null {
  try {
    const range = host.ownerDocument.createRange();
    range.setStart(host, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

// Resolve a contenteditable host + mouse event to a character offset, preferring
// the click point and falling back to the current selection.
export function offsetForEvent(host: HTMLElement, e: MouseEvent): number | null {
  return offsetFromPoint(host, e.clientX, e.clientY) ?? offsetFromSelection(host);
}
