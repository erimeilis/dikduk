import { el } from '../popup';

export function renderSuggestions(word: string, suggestions: string[]): HTMLElement {
  const wrap = el('div', 'pealim-popup');
  wrap.setAttribute('dir', 'rtl');
  wrap.appendChild(el('div', 'pealim-meta', `"${word}"`));

  if (suggestions.length) {
    const box = el('div', 'pealim-chips');
    for (const s of suggestions) {
      const b = document.createElement('button');
      b.className = 'pealim-chip';
      b.dataset.suggest = s;
      b.textContent = s;
      box.appendChild(b);
    }
    wrap.appendChild(box);
  } else {
    wrap.appendChild(el('div', 'pealim-ocr-empty', 'No suggestions'));
  }

  const actions = el('div', 'pealim-spell-actions');
  const mk = (action: string, label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'pealim-spell-action';
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
