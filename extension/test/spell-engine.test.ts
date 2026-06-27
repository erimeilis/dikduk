import { describe, it, expect } from 'vitest';
import { createDictionaryEngine } from '../src/spellcheck/engine';

const AFF = `
SET UTF-8
PFX a N 2
PFX a 0 ה .
PFX a 0 ו .
`;

const DIC = `
7
שלום/a
ספר/a
שרטוט/a
רוצה/a
סוף/a
שלו/a
שולו/a
`;

describe('createDictionaryEngine', () => {
  it('checks exact dictionary words and simple Hspell prefixes', () => {
    const engine = createDictionaryEngine(AFF, DIC);
    expect(engine.correct('שלום')).toBe(true);
    expect(engine.correct('הספר')).toBe(true);
    expect(engine.correct('ושלום')).toBe(true);
    expect(engine.correct('שולום')).toBe(false);
    expect(engine.check(['שלום', 'שולום'])).toEqual(['שולום']);
  });

  it('suggests nearby dictionary words without constructing nspell', () => {
    const engine = createDictionaryEngine(AFF, DIC);
    expect(engine.suggest('שולום')).toContain('שלום');
    expect(engine.suggest('שרטטע')).toContain('שרטוט');
    expect(engine.suggest('סופ')[0]).toBe('סוף');
  });
});
