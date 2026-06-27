import { describe, it, expect } from 'vitest';
import { flagsToOffsets } from '../src/spellcheck/highlight-main';

describe('flagsToOffsets', () => {
  it('passes through start/end offsets for a single-text-node host', () => {
    const div = document.createElement('div');
    div.textContent = 'אני רוצה שלוום';
    expect(flagsToOffsets(div, [{ text: 'שלוום', start: 9, end: 14 }])).toEqual([
      { start: 9, end: 14 },
    ]);
  });
});
