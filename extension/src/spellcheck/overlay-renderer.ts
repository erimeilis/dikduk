const COPIED_STYLES = [
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'textAlign', 'direction', 'padding', 'border', 'boxSizing', 'whiteSpace',
  'wordWrap', 'width', 'height',
] as const;

export interface OverlayRange {
  start: number;
  end: number;
  kind?: 'spell' | 'grammar';
}

export class OverlayRenderer {
  readonly overlayEl: HTMLDivElement;
  private field: HTMLInputElement | HTMLTextAreaElement;
  private readonly resizeObserver: ResizeObserver | undefined;
  private frame = 0;
  private destroyed = false;

  constructor(field: HTMLInputElement | HTMLTextAreaElement) {
    this.field = field;
    this.overlayEl = document.createElement('div');
    this.overlayEl.setAttribute('aria-hidden', 'true');
    this.overlayEl.style.cssText =
      'position:absolute;pointer-events:none;color:transparent;overflow:hidden;z-index:2147483646;';
    document.body.appendChild(this.overlayEl);
    this.syncStyle();
    // Flags outlive focus, so the overlay must follow the field on its own:
    // its internal scroll, scrolling ancestors, resizes and page layout changes
    // (a body resize), and the field going away.
    field.addEventListener('scroll', this.onFieldScroll, { passive: true });
    document.addEventListener('scroll', this.scheduleSync, { capture: true, passive: true });
    window.addEventListener('resize', this.scheduleSync);
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(this.scheduleSync);
    this.resizeObserver?.observe(field);
    this.resizeObserver?.observe(document.body);
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  private onFieldScroll = (): void => {
    this.overlayEl.scrollTop = this.field.scrollTop;
    this.overlayEl.scrollLeft = this.field.scrollLeft;
  };

  // Coalesce bursts (scroll, observer callbacks) into one sync per frame.
  private scheduleSync = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.syncStyle();
    });
  };

  private syncStyle(): void {
    // A detached field leaves nothing to underline: tear down instead of
    // floating ghost underlines (FlagStore makes a fresh one if it returns).
    if (!this.field.isConnected) {
      this.destroy();
      return;
    }
    const cs = getComputedStyle(this.field);
    for (const k of COPIED_STYLES) (this.overlayEl.style as unknown as Record<string, string>)[k] = cs[k];
    const rect = this.field.getBoundingClientRect();
    this.overlayEl.style.left = `${rect.left + window.scrollX}px`;
    this.overlayEl.style.top = `${rect.top + window.scrollY}px`;
    this.overlayEl.style.whiteSpace = this.field instanceof HTMLInputElement ? 'pre' : 'pre-wrap';
    this.overlayEl.style.unicodeBidi = 'plaintext';
  }

  mark(ranges: OverlayRange[]): void {
    this.syncStyle();
    this.overlayEl.textContent = '';
    const v = this.field.value;
    let cursor = 0;
    const sorted = ranges
      .filter((r) => r.start >= 0 && r.end > r.start && r.end <= v.length)
      .sort((a, b) => a.start - b.start || b.end - a.end);
    for (const r of sorted) {
      if (r.start < cursor) continue;
      this.overlayEl.appendChild(document.createTextNode(v.slice(cursor, r.start)));
      const span = document.createElement('span');
      const kind = r.kind ?? 'spell';
      span.className = kind === 'grammar' ? 'dikduk-grammar' : 'dikduk-misspell';
      span.textContent = v.slice(r.start, r.end);
      span.dataset.start = String(r.start);
      span.dataset.end = String(r.end);
      span.style.textDecorationLine = 'underline';
      span.style.textDecorationStyle = 'wavy';
      span.style.textDecorationColor = kind === 'grammar' ? '#c56a00' : '#d11';
      span.style.textUnderlineOffset = '2px';
      span.style.unicodeBidi = 'isolate';
      this.overlayEl.appendChild(span);
      cursor = r.end;
    }
    this.overlayEl.appendChild(document.createTextNode(v.slice(cursor)));
    this.onFieldScroll();
  }

  clear(): void {
    this.overlayEl.textContent = '';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.field.removeEventListener('scroll', this.onFieldScroll);
    document.removeEventListener('scroll', this.scheduleSync, { capture: true });
    window.removeEventListener('resize', this.scheduleSync);
    this.resizeObserver?.disconnect();
    this.overlayEl.remove();
  }
}
