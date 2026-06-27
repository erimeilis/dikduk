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
