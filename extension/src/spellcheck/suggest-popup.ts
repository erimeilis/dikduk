import { el } from '../shared/dom';

export function renderSuggestions(word: string, suggestions: string[]): HTMLElement {
  const wrap = el('div', 'dikduk-popup');
  wrap.setAttribute('dir', 'rtl');
  wrap.appendChild(el('div', 'dikduk-meta', `"${word}"`));

  if (suggestions.length) {
    const box = el('div', 'dikduk-chips');
    for (const s of suggestions) {
      const b = document.createElement('button');
      b.className = 'dikduk-chip';
      b.dataset.suggest = s;
      b.textContent = s;
      box.appendChild(b);
    }
    wrap.appendChild(box);
  } else {
    wrap.appendChild(el('div', 'dikduk-ocr-empty', 'No suggestions'));
  }

  const actions = el('div', 'dikduk-spell-actions');
  const mk = (action: string, label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'dikduk-spell-action';
    b.dataset.action = action;
    b.textContent = label;
    return b;
  };
  actions.appendChild(mk('lookup', 'Look up in Pealim'));
  actions.appendChild(mk('add', 'Add to my words'));
  actions.appendChild(mk('ignore', 'Ignore'));
  wrap.appendChild(actions);
  return wrap;
}
