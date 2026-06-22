import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDictPage } from '../src/dict-parser';

const html = readFileSync('test/fixtures/dict-levakesh.html', 'utf-8');

describe('parseDictPage', () => {
  const { binyan, conjugation } = parseDictPage(html);

  it("reads the Active-forms binyan", () => {
    expect(binyan).toBe("Pi'el");
  });

  it('reads present-tense masculine singular (AP-ms)', () => {
    expect(conjugation.present.ms.replace(/\p{Mn}/gu, '')).toMatch(/מבקש/);
  });

  it('reads the infinitive (INF-L)', () => {
    expect(conjugation.infinitive.replace(/\p{Mn}/gu, '')).toMatch(/לבקש/);
  });

  it('fills every Active-forms coordinate (non-empty)', () => {
    const all = [
      ...Object.values(conjugation.present),
      ...Object.values(conjugation.past),
      ...Object.values(conjugation.future),
      ...Object.values(conjugation.imperative),
      conjugation.infinitive,
    ];
    expect(all.every((s) => s.length > 0)).toBe(true);
  });

  it('does NOT pull from the Passive-forms table', () => {
    // AP-ms is the active present m.sg.; passive cells are prefixed `passive-`.
    expect(conjugation.present.ms.replace(/\p{Mn}/gu, '')).not.toMatch(/מבוקש/);
  });
});
