import { describe, it, expect } from 'vitest';
import { containsHebrew, extractWord } from '../src/shared/hebrew';

describe('containsHebrew', () => {
  it('detects Hebrew letters', () => {
    expect(containsHebrew('לבקש')).toBe(true);
    expect(containsHebrew('מְבֻקָּשׁ')).toBe(true); // with niqqud
  });
  it('rejects non-Hebrew', () => {
    expect(containsHebrew('hello')).toBe(false);
    expect(containsHebrew('123 .,!')).toBe(false);
  });
});

describe('extractWord', () => {
  it('trims and takes the first token', () => {
    expect(extractWord('  לבקש  ')).toBe('לבקש');
    expect(extractWord('לבקש מאוד')).toBe('לבקש');
  });
});
