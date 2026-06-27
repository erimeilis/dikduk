import { describe, it, expect } from 'vitest';
import { renderSuggestions } from '../src/spellcheck/suggest-popup';

describe('renderSuggestions', () => {
  it('renders one button per suggestion carrying data-suggest + the three actions', () => {
    const el = renderSuggestions('שלוום', ['שלום', 'שלומו']);
    expect(el.getAttribute('dir')).toBe('rtl');
    const sugg = el.querySelectorAll('button[data-suggest]');
    expect(sugg.length).toBe(2);
    expect(sugg[0].getAttribute('data-suggest')).toBe('שלום');
    const actions = Array.from(el.querySelectorAll('button[data-action]')).map((b) =>
      b.getAttribute('data-action'),
    );
    expect(actions).toEqual(['lookup', 'add', 'ignore']);
  });
  it('shows a no-suggestions message but still offers actions', () => {
    const el = renderSuggestions('זזזז', []);
    expect(el.querySelector('button[data-suggest]')).toBeNull();
    expect(el.textContent).toContain('No suggestions');
    expect(el.querySelectorAll('button[data-action]').length).toBe(3);
  });
});
