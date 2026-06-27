import { describe, it, expect } from 'vitest';
import { OverlayRenderer } from '../src/spellcheck/render-overlay';

describe('OverlayRenderer', () => {
  it('renders a mark span per flagged range and clears them', () => {
    const ta = document.createElement('textarea');
    ta.value = 'אני רוצה שלוום';
    document.body.appendChild(ta);
    const r = new OverlayRenderer(ta);
    r.mark([{ text: 'שלוום', start: 9, end: 14 }]);
    const marks = r.overlayEl.querySelectorAll('.pealim-misspell');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('שלוום');
    expect((marks[0] as HTMLElement).style.textDecorationLine).toBe('underline');
    expect((marks[0] as HTMLElement).style.textDecorationStyle).toBe('wavy');
    expect((marks[0] as HTMLElement).style.textDecorationColor).toBe('#d11');
    r.clear();
    expect(r.overlayEl.querySelectorAll('.pealim-misspell').length).toBe(0);
  });
});
