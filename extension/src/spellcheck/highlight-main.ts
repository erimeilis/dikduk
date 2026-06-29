import { rangesForOffsets, type OffsetSpan } from '../shared/dom-offsets';

const STYLE_ID = 'dikduk-misspell-style';
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '::highlight(dikduk-misspelled){ text-decoration: red wavy underline; }',
    '::highlight(dikduk-grammar){ text-decoration: #c56a00 wavy underline; }',
  ].join('\n');
  document.head.appendChild(s);
}

interface FlagDetail {
  offsets: OffsetSpan[];
  grammarOffsets?: OffsetSpan[];
}

function install(): void {
  if (typeof Highlight === 'undefined' || !('highlights' in CSS)) return; // overlay fallback handles it
  ensureStyle();
  window.addEventListener('dikduk-spell-flags', (ev: Event) => {
    const detail = (ev as CustomEvent<FlagDetail>).detail;
    const host = document.activeElement as HTMLElement | null;
    if (!host || !detail) {
      CSS.highlights.delete('dikduk-misspelled');
      return;
    }
    const spellRanges = rangesForOffsets(host, detail.offsets ?? []);
    const grammarRanges = rangesForOffsets(host, detail.grammarOffsets ?? []);
    if (spellRanges.length) CSS.highlights.set('dikduk-misspelled', new Highlight(...spellRanges));
    else CSS.highlights.delete('dikduk-misspelled');
    if (grammarRanges.length) CSS.highlights.set('dikduk-grammar', new Highlight(...grammarRanges));
    else CSS.highlights.delete('dikduk-grammar');
  });
}

install();
