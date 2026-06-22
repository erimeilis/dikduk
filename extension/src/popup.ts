import { type LookupResponse, type LookupResult, isLookupError } from './types';

export const POPUP_CSS = `
.pealim-popup {
  all: initial;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  direction: rtl; text-align: right;
  background: #fff; color: #1a1a1a;
  border: 1px solid #d0d0d0; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  padding: 10px 12px; max-width: 360px; font-size: 15px; line-height: 1.4;
}
.pealim-popup .pealim-lemma { font-size: 20px; font-weight: 700; }
.pealim-popup .pealim-translation { margin-top: 2px; color: #333; }
.pealim-popup .pealim-meta { margin-top: 4px; font-size: 13px; color: #666; }
.pealim-popup table { border-collapse: collapse; margin-top: 8px; width: 100%; }
.pealim-popup th, .pealim-popup td {
  border: 1px solid #e3e3e3; padding: 3px 6px; text-align: center; font-size: 14px;
}
.pealim-popup th { background: #f5f5f5; font-weight: 600; font-size: 12px; color: #555; }
.pealim-popup td.pealim-rowlabel { background: #fafafa; font-size: 12px; color: #555; }
.pealim-popup .pealim-source { margin-top: 6px; font-size: 12px; }
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

function td(text: string, span = 1, cls = ''): HTMLTableCellElement {
  const c = document.createElement('td');
  c.textContent = text;
  if (span > 1) c.colSpan = span;
  if (cls) c.className = cls;
  return c;
}

function th(text: string, span = 1): HTMLTableCellElement {
  const c = document.createElement('th');
  c.textContent = text;
  if (span > 1) c.colSpan = span;
  return c;
}

function buildMatrix(r: LookupResult): HTMLTableElement {
  const c = r.conjugation!;
  const table = document.createElement('table');

  // Header rows: Singular(M,F) | Plural(M,F)
  const h1 = document.createElement('tr');
  h1.appendChild(th(''));
  h1.appendChild(th('Singular', 2));
  h1.appendChild(th('Plural', 2));
  const h2 = document.createElement('tr');
  h2.appendChild(th(''));
  h2.appendChild(th('M')); h2.appendChild(th('F'));
  h2.appendChild(th('M')); h2.appendChild(th('F'));
  table.appendChild(h1); table.appendChild(h2);

  const row = (label: string, cells: HTMLTableCellElement[]) => {
    const tr = document.createElement('tr');
    tr.appendChild(td(label, 1, 'pealim-rowlabel'));
    cells.forEach((x) => tr.appendChild(x));
    table.appendChild(tr);
  };

  row('Present', [td(c.present.ms), td(c.present.fs), td(c.present.mp), td(c.present.fp)]);
  row('Past 1', [td(c.past['1s'], 2), td(c.past['1p'], 2)]);
  row('Past 2', [td(c.past['2ms']), td(c.past['2fs']), td(c.past['2mp']), td(c.past['2fp'])]);
  row('Past 3', [td(c.past['3ms']), td(c.past['3fs']), td(c.past['3p'], 2)]);
  row('Future 1', [td(c.future['1s'], 2), td(c.future['1p'], 2)]);
  row('Future 2', [td(c.future['2ms']), td(c.future['2fs']), td(c.future['2mp']), td(c.future['2fp'])]);
  row('Future 3', [td(c.future['3ms']), td(c.future['3fs']), td(c.future['3mp']), td(c.future['3fp'])]);
  row('Imperative', [td(c.imperative['2ms']), td(c.imperative['2fs']), td(c.imperative['2mp']), td(c.imperative['2fp'])]);
  row('Infinitive', [td(c.infinitive, 4)]);

  return table;
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

  const metaBits = [data.root ? `root ${data.root}` : '', data.binyan ?? ''].filter(Boolean);
  if (metaBits.length) wrap.appendChild(el('div', 'pealim-meta', metaBits.join(' · ')));

  if (data.isVerb && data.conjugation) wrap.appendChild(buildMatrix(data));

  const src = el('div', 'pealim-source');
  const a = document.createElement('a');
  if (/^https?:\/\//i.test(data.sourceUrl)) {
    a.href = data.sourceUrl;
  }
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
