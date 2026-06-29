import { type LookupResponse, type Conjugation, isLookupError } from '../contracts/lookup';
import { el, cell } from '../shared/dom';

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
    tr.appendChild(cell('td', label, 1, 'dikduk-rowlabel'));
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
  d.setAttribute('name', 'dikduk-accordion'); // exclusive accordion — opening one closes the others
  if (open) d.open = true;
  const s = document.createElement('summary');
  s.textContent = title;
  d.appendChild(s);
  d.appendChild(body);
  return d;
}

function buildSeeAlso(refs: { label: string; slug: string }[]): HTMLElement {
  const box = el('div', 'dikduk-seealso');
  for (const r of refs) {
    const a = document.createElement('a');
    a.href = `https://www.pealim.com/dict/${r.slug}/`;
    a.className = 'dikduk-seealso-link';
    a.dataset.word = r.label;
    a.textContent = r.label;
    box.appendChild(a);
  }
  return box;
}

export function renderPopup(data: LookupResponse): HTMLElement {
  const wrap = el('div', 'dikduk-popup');
  wrap.setAttribute('dir', 'rtl');

  if (isLookupError(data)) {
    wrap.classList.add('dikduk-error');
    wrap.appendChild(el('div', 'dikduk-errmsg', data.error));
    return wrap;
  }

  wrap.appendChild(el('div', 'dikduk-lemma', data.lemma || data.word));
  if (data.translation) wrap.appendChild(el('div', 'dikduk-translation', data.translation));
  if (data.root) wrap.appendChild(el('div', 'dikduk-meta', `root ${data.root}`));

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

  const src = el('div', 'dikduk-source');
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
  const wrap = el('div', 'dikduk-popup dikduk-loading');
  wrap.setAttribute('dir', 'rtl');
  wrap.appendChild(el('div', undefined, `…${word}`));
  return wrap;
}

export function renderChips(words: string[]): HTMLElement {
  const wrap = el('div', 'dikduk-popup');
  wrap.setAttribute('dir', 'rtl');
  if (!words.length) {
    wrap.appendChild(el('div', 'dikduk-ocr-empty', 'No Hebrew text found in this image.'));
    return wrap;
  }
  wrap.appendChild(el('div', 'dikduk-meta', 'Tap a word:'));
  const box = el('div', 'dikduk-chips');
  for (const w of words) {
    const b = document.createElement('button');
    b.className = 'dikduk-chip';
    b.dataset.word = w;
    b.textContent = w;
    box.appendChild(b);
  }
  wrap.appendChild(box);
  return wrap;
}

export function renderOcrLoading(): HTMLElement {
  const wrap = el('div', 'dikduk-popup dikduk-loading');
  wrap.appendChild(el('div', undefined, 'Reading image…'));
  return wrap;
}
