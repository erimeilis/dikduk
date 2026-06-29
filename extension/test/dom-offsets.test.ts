import { describe, it, expect } from 'vitest';
import { locateTextOffset, rangeFromOffsets, rangesForOffsets } from '../src/shared/dom-offsets';

describe('locateTextOffset', () => {
  it('resolves a character offset to (text node, local offset) for a single text node', () => {
    const div = document.createElement('div');
    div.textContent = 'אני רוצה שלוום';
    const loc = locateTextOffset(div, 9);
    expect(loc?.node.data).toBe('אני רוצה שלוום');
    expect(loc?.offset).toBe(9);
  });

  it('walks across multiple text nodes', () => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode('אבג'));
    div.appendChild(document.createTextNode('דהו'));
    const loc = locateTextOffset(div, 4);
    expect(loc?.node.data).toBe('דהו');
    expect(loc?.offset).toBe(1);
  });

  it('returns null for an out-of-range offset', () => {
    const div = document.createElement('div');
    div.textContent = 'אבג';
    expect(locateTextOffset(div, 99)).toBeNull();
  });
});

describe('rangeFromOffsets / rangesForOffsets', () => {
  it('builds a range spanning the requested offsets', () => {
    const div = document.createElement('div');
    div.textContent = 'אני רוצה שלוום';
    const range = rangeFromOffsets(div, 9, 14);
    expect(range?.toString()).toBe('שלוום');
  });

  it('skips spans that cannot be resolved', () => {
    const div = document.createElement('div');
    div.textContent = 'אני רוצה שלוום';
    const ranges = rangesForOffsets(div, [
      { start: 9, end: 14 },
      { start: 50, end: 60 },
    ]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe('שלוום');
  });
});
