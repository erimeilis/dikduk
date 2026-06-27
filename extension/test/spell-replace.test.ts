import { describe, it, expect, vi } from 'vitest';
import { replaceInTextField, replaceInRange } from '../src/spellcheck/replace';

describe('replaceInTextField', () => {
  it('splices the value, restores caret, and dispatches input', () => {
    const ta = document.createElement('textarea');
    ta.value = 'אני רוצה שלוום עכשיו';
    document.body.appendChild(ta);
    const onInput = vi.fn();
    ta.addEventListener('input', onInput);
    // "שלוום" occupies indices 9..14
    replaceInTextField(ta, 9, 14, 'שלום');
    expect(ta.value).toBe('אני רוצה שלום עכשיו');
    expect(ta.selectionStart).toBe(9 + 'שלום'.length);
    expect(onInput).toHaveBeenCalledOnce();
  });
});

describe('replaceInRange', () => {
  it('replaces the range text and dispatches input on the editable host', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.textContent = 'שלוום';
    document.body.appendChild(div);
    const onInput = vi.fn();
    div.addEventListener('input', onInput);
    const range = document.createRange();
    range.setStart(div.firstChild!, 0);
    range.setEnd(div.firstChild!, 5);
    replaceInRange(range, 'שלום');
    expect(div.textContent).toBe('שלום');
    expect(onInput).toHaveBeenCalledOnce();
    const sel = window.getSelection()!;
    expect(sel.rangeCount).toBe(1);
    const r = sel.getRangeAt(0);
    expect(r.collapsed).toBe(true);
    expect(r.startContainer).toBe(div);
    // happy-dom does not normalize adjacent empty text nodes left by deleteContents(),
    // so the inserted text node is child[1]; setStartAfter(child[1]) → startOffset 2
    expect(r.startOffset).toBe(2);
  });
});
