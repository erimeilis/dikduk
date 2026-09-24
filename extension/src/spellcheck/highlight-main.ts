import { FIELD_ID_ATTR, rangesForOffsets, type SpellFlagsDetail } from '../shared/dom-offsets';

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

interface FieldRanges {
  host: HTMLElement;
  spell: Range[];
  grammar: Range[];
}

// Flags persist after blur, so several fields can carry highlights at once.
// Keep each field's ranges separately and publish their union under the two
// highlight names, so painting one field never wipes another.
const byField = new Map<string, FieldRanges>();

function publish(): void {
  const spell: Range[] = [];
  const grammar: Range[] = [];
  for (const [id, entry] of byField) {
    if (!entry.host.isConnected) {
      byField.delete(id);
      continue;
    }
    spell.push(...entry.spell);
    grammar.push(...entry.grammar);
  }
  if (spell.length) CSS.highlights.set('dikduk-misspelled', new Highlight(...spell));
  else CSS.highlights.delete('dikduk-misspelled');
  if (grammar.length) CSS.highlights.set('dikduk-grammar', new Highlight(...grammar));
  else CSS.highlights.delete('dikduk-grammar');
}

function install(): void {
  if (typeof Highlight === 'undefined' || !('highlights' in CSS)) return; // overlay fallback handles it
  ensureStyle();
  window.addEventListener('dikduk-spell-flags', (ev: Event) => {
    const detail = (ev as CustomEvent<SpellFlagsDetail>).detail;
    if (!detail?.fieldId) return;
    const host = document.querySelector<HTMLElement>(`[${FIELD_ID_ATTR}="${CSS.escape(detail.fieldId)}"]`);
    const spell = host ? rangesForOffsets(host, detail.offsets ?? []) : [];
    const grammar = host ? rangesForOffsets(host, detail.grammarOffsets ?? []) : [];
    if (host && (spell.length || grammar.length)) {
      byField.set(detail.fieldId, { host, spell, grammar });
    } else {
      byField.delete(detail.fieldId);
    }
    publish();
  });
}

install();
