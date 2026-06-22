import { describe, it, expect } from 'vitest';
import { renderPopup } from '../src/popup';
import type { LookupResult } from '../src/types';

const verb: LookupResult = {
  word: 'לבקש', lemma: 'לְבַקֵּשׁ', translation: 'to ask, to request', root: 'ב־ק־שׁ',
  isVerb: true, binyan: "Pi'el",
  conjugation: {
    present: { ms: 'מְבַקֵּשׁ', fs: 'מְבַקֶּשֶׁת', mp: 'מְבַקְשִׁים', fp: 'מְבַקְשׁוֹת' },
    past: { '1s': 'בִּקַּשְׁתִּי', '1p': 'בִּקַּשְׁנוּ', '2ms': 'בִּקַּשְׁתָּ', '2fs': 'בִּקַּשְׁתְּ', '2mp': 'בִּקַּשְׁתֶּם', '2fp': 'בִּקַּשְׁתֶּן', '3ms': 'בִּקֵּשׁ', '3fs': 'בִּקְּשָׁה', '3p': 'בִּקְּשׁוּ' },
    future: { '1s': 'אֲבַקֵּשׁ', '1p': 'נְבַקֵּשׁ', '2ms': 'תְּבַקֵּשׁ', '2fs': 'תְּבַקְשִׁי', '2mp': 'תְּבַקְשׁוּ', '2fp': 'תְּבַקֵּשְׁנָה', '3ms': 'יְבַקֵּשׁ', '3fs': 'תְּבַקֵּשׁ', '3mp': 'יְבַקְשׁוּ', '3fp': 'תְּבַקֵּשְׁנָה' },
    imperative: { '2ms': 'בַּקֵּשׁ', '2fs': 'בַּקְשִׁי', '2mp': 'בַּקְשׁוּ', '2fp': 'בַּקֵּשְׁנָה' },
    infinitive: 'לְבַקֵּשׁ',
  },
  sourceUrl: 'https://www.pealim.com/dict/255-levakesh/',
};

const adj: LookupResult = {
  word: 'מבוקש', lemma: 'מְבוּקָּשׁ', translation: 'wanted, required, desired', root: 'ב־ק־שׁ',
  isVerb: false, sourceUrl: 'https://www.pealim.com/dict/9321-mevukash/',
};

describe('renderPopup', () => {
  it('renders header for any word', () => {
    const el = renderPopup(adj);
    expect(el.getAttribute('dir')).toBe('rtl');
    expect(el.textContent).toContain('מְבוּקָּשׁ');
    expect(el.textContent).toContain('wanted, required, desired');
    expect(el.textContent).toContain('ב־ק־שׁ');
    expect(el.querySelector('table')).toBeNull(); // no matrix for non-verb
  });

  it('renders the conjugation matrix for verbs', () => {
    const el = renderPopup(verb);
    const table = el.querySelector('table');
    expect(table).not.toBeNull();
    expect(el.textContent).toContain("Pi'el");
    expect(el.textContent).toContain('מְבַקֵּשׁ');   // present ms
    expect(el.textContent).toContain('בִּקֵּשׁ');     // past 3ms
    expect(el.textContent).toContain('יְבַקֵּשׁ');    // future 3ms
    expect(el.textContent).toContain('בַּקֵּשׁ');     // imperative 2ms
    expect(el.textContent).toContain('לְבַקֵּשׁ');    // infinitive
  });

  it('renders an error message', () => {
    const el = renderPopup({ error: 'No Pealim entry for "xyz"', code: 'NO_RESULTS' });
    expect(el.classList.contains('pealim-error')).toBe(true);
    expect(el.textContent).toContain('No Pealim entry');
  });
});
