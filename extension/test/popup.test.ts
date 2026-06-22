import { describe, it, expect } from 'vitest';
import { renderPopup } from '../src/popup';
import type { Conjugation, LookupResult } from '../src/types';

const activeForms: Conjugation = {
  present: { ms: 'מְבַקֵּשׁ', fs: 'מְבַקֶּשֶׁת', mp: 'מְבַקְשִׁים', fp: 'מְבַקְשׁוֹת' },
  past: { '1s': 'בִּקַּשְׁתִּי', '1p': 'בִּקַּשְׁנוּ', '2ms': 'בִּקַּשְׁתָּ', '2fs': 'בִּקַּשְׁתְּ', '2mp': 'בִּקַּשְׁתֶּם', '2fp': 'בִּקַּשְׁתֶּן', '3ms': 'בִּקֵּשׁ', '3fs': 'בִּקְּשָׁה', '3p': 'בִּקְּשׁוּ' },
  future: { '1s': 'אֲבַקֵּשׁ', '1p': 'נְבַקֵּשׁ', '2ms': 'תְּבַקֵּשׁ', '2fs': 'תְּבַקְשִׁי', '2mp': 'תְּבַקְשׁוּ', '2fp': 'תְּבַקֵּשְׁנָה', '3ms': 'יְבַקֵּשׁ', '3fs': 'תְּבַקֵּשׁ', '3mp': 'יְבַקְשׁוּ', '3fp': 'תְּבַקֵּשְׁנָה' },
  imperative: { '2ms': 'בַּקֵּשׁ', '2fs': 'בַּקְשִׁי', '2mp': 'בַּקְשׁוּ', '2fp': 'בַּקֵּשְׁנָה' },
  infinitive: 'לְבַקֵּשׁ',
};
// Pu'al passive: no imperative, no infinitive
const passiveForms: Conjugation = {
  present: { ms: 'מְבֻקָּשׁ', fs: 'מְבֻקֶּשֶׁת', mp: 'מְבֻקָּשִׁים', fp: 'מְבֻקָּשׁוֹת' },
  past: { '1s': 'בֻּקַּשְׁתִּי', '1p': 'בֻּקַּשְׁנוּ', '2ms': 'בֻּקַּשְׁתָּ', '2fs': 'בֻּקַּשְׁתְּ', '2mp': 'בֻּקַּשְׁתֶּם', '2fp': 'בֻּקַּשְׁתֶּן', '3ms': 'בֻּקַּשׁ', '3fs': 'בֻּקְּשָׁה', '3p': 'בֻּקְּשׁוּ' },
  future: { '1s': 'אֲבֻקַּשׁ', '1p': 'נְבֻקַּשׁ', '2ms': 'תְּבֻקַּשׁ', '2fs': 'תְּבֻקְּשִׁי', '2mp': 'תְּבֻקְּשׁוּ', '2fp': 'תְּבֻקַּשְׁנָה', '3ms': 'יְבֻקַּשׁ', '3fs': 'תְּבֻקַּשׁ', '3mp': 'יְבֻקְּשׁוּ', '3fp': 'תְּבֻקַּשְׁנָה' },
  imperative: { '2ms': '', '2fs': '', '2mp': '', '2fp': '' },
  infinitive: '',
};
const verb: LookupResult = {
  word: 'לבקש', lemma: 'לְבַקֵּשׁ', slug: '255-levakesh', translation: 'to ask, to request', root: 'ב־ק־שׁ',
  isVerb: true,
  voices: { active: { binyan: "Pi'el", forms: activeForms }, passive: { binyan: "Pu'al", forms: passiveForms } },
  seeAlso: [{ label: 'בַּקָּשָׁה', slug: '3000-bakasha' }, { label: 'בִּיקּוּשׁ', slug: '2955-bikush' }],
  sourceUrl: 'https://www.pealim.com/dict/255-levakesh/',
};
const noun: LookupResult = {
  word: 'מבוקש', lemma: 'מְבוּקָּשׁ', slug: '9321-mevukash', translation: 'wanted, required', root: 'ב־ק־שׁ',
  isVerb: false, seeAlso: [], sourceUrl: 'https://www.pealim.com/dict/9321-mevukash/',
};

describe('renderPopup accordion', () => {
  it('renders header + Active(open) + Passive + See also for a verb', () => {
    const el = renderPopup(verb);
    expect(el.getAttribute('dir')).toBe('rtl');
    expect(el.textContent).toContain('לְבַקֵּשׁ');
    expect(el.textContent).toContain('to ask, to request');
    expect(el.textContent).toContain('ב־ק־שׁ');
    const sections = el.querySelectorAll('details');
    expect(sections.length).toBe(3); // active, passive, see-also
    // Active section is open and has a matrix with present.ms
    const active = sections[0];
    expect(active.hasAttribute('open')).toBe(true);
    expect(active.querySelector('summary')?.textContent).toContain("Pi'el");
    expect(active.querySelector('table')).not.toBeNull();
    expect(active.textContent).toContain('מְבַקֵּשׁ');
    // Passive section present, collapsed, labelled Pu'al
    const passive = sections[1];
    expect(passive.hasAttribute('open')).toBe(false);
    expect(passive.querySelector('summary')?.textContent).toContain("Pu'al");
    expect(passive.textContent).toContain('מְבֻקָּשׁ');
    // See also section lists links to /dict/<slug>/
    const see = sections[2];
    expect(see.querySelector('summary')?.textContent).toContain('See also');
    const links = Array.from(see.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('https://www.pealim.com/dict/3000-bakasha/');
    // Exclusive accordion: every <details> shares the same name attribute
    expect(Array.from(el.querySelectorAll('details')).every((d) => d.getAttribute('name') === 'pealim-accordion')).toBe(true);
    // See-also links carry data-word for in-popup lookup
    expect(see.querySelector('a')?.getAttribute('data-word')).toBe('בַּקָּשָׁה');
  });

  it('skips empty rows: passive matrix has no imperative/infinitive rows', () => {
    const el = renderPopup(verb);
    const passive = el.querySelectorAll('details')[1];
    expect(passive.textContent).not.toContain('Imperative');
    expect(passive.textContent).not.toContain('Infinitive');
    // active still has them
    const active = el.querySelectorAll('details')[0];
    expect(active.textContent).toContain('Imperative');
    expect(active.textContent).toContain('Infinitive');
  });

  it('renders only the header for a non-verb with no see-also', () => {
    const el = renderPopup(noun);
    expect(el.textContent).toContain('מְבוּקָּשׁ');
    expect(el.textContent).toContain('wanted, required');
    expect(el.textContent).toContain('root ');
    expect(el.querySelector('details')).toBeNull();
    expect(el.querySelector('table')).toBeNull();
  });

  it('does not set a non-http(s) sourceUrl as the link href (XSS guard)', () => {
    const el = renderPopup({ ...noun, sourceUrl: 'javascript:alert(1)' });
    const a = el.querySelector('.pealim-source a');
    expect(a).not.toBeNull();
    expect(a?.getAttribute('href')).toBeNull();
  });

  it('renders an error', () => {
    const el = renderPopup({ error: 'No Pealim entry for «xyz»', code: 'NO_RESULTS' });
    expect(el.classList.contains('pealim-error')).toBe(true);
    expect(el.textContent).toContain('No Pealim entry');
  });
});
