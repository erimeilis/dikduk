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
    for (const k of COPIED_STYLES) (this.overlayEl.style as unknown as Record<string, string>)[k] = cs[k];
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
      span.style.textDecorationLine = 'underline';
      span.style.textDecorationStyle = 'wavy';
      span.style.textDecorationColor = '#d11';
      span.style.textUnderlineOffset = '2px';
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
