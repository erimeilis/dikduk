import { describe, it, expect } from 'vitest';
import { OverlayRenderer } from '../src/spellcheck/overlay-renderer';

describe('OverlayRenderer', () => {
  it('renders a mark span per flagged range and clears them', () => {
    const ta = document.createElement('textarea');
    ta.value = 'אני רוצה שלוום';
    document.body.appendChild(ta);
    const r = new OverlayRenderer(ta);
    r.mark([{ start: 9, end: 14 }]);
    const marks = r.overlayEl.querySelectorAll('.dikduk-misspell');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('שלוום');
    expect((marks[0] as HTMLElement).style.textDecorationLine).toBe('underline');
    expect((marks[0] as HTMLElement).style.textDecorationStyle).toBe('wavy');
    expect((marks[0] as HTMLElement).style.textDecorationColor).toBe('#d11');
    r.clear();
    expect(r.overlayEl.querySelectorAll('.dikduk-misspell').length).toBe(0);
  });

  it('renders grammar ranges with a separate class and color', () => {
    const ta = document.createElement('textarea');
    ta.value = 'הספר טובה';
    document.body.appendChild(ta);
    const r = new OverlayRenderer(ta);
    r.mark([{ start: 0, end: 9, kind: 'grammar' }]);
    const marks = r.overlayEl.querySelectorAll('.dikduk-grammar');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('הספר טובה');
    expect((marks[0] as HTMLElement).style.textDecorationColor).toBe('#c56a00');
    r.destroy();
  });

  it('follows the field scroll and tears down once the field is removed', async () => {
    const ta = document.createElement('textarea');
    ta.value = 'אני רוצה שלוום';
    document.body.appendChild(ta);
    const r = new OverlayRenderer(ta);
    r.mark([{ start: 9, end: 14 }]);

    ta.scrollTop = 7;
    ta.dispatchEvent(new Event('scroll'));
    expect(r.overlayEl.scrollTop).toBe(ta.scrollTop);

    ta.remove();
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(r.isDestroyed).toBe(true);
    expect(r.overlayEl.isConnected).toBe(false);
  });
});
