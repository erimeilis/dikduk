import { type LookupResponse, type Conjugation, isLookupError } from './types';

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
  d.setAttribute('name', 'pealim-accordion'); // exclusive accordion — opening one closes the others
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
    a.className = 'pealim-seealso-link';
    a.dataset.word = r.label;
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
  if (data.seeAlso?.length) {
    wrap.appendChild(detailsSection(`See also (${data.seeAlso.length})`, buildSeeAlso(data.seeAlso), false));
  }

  const src = el('div', 'pealim-source');
  const a = document.createElement('a');
  if (/^https?:\/\//i.test(data.sourceUrl)) a.href = data.sourceUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
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
