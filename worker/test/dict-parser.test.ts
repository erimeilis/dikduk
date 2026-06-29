import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDictPage } from '../src/dict-parser';

const html = readFileSync('test/fixtures/dict-levakesh.html', 'utf-8');
const bare = (s: string) => s.replace(/\p{Mn}/gu, '');

describe('parseDictPage', () => {
  const { voices, seeAlso } = parseDictPage(html);

  it('reads active voice (Pi\'el) with present + infinitive', () => {
    expect(voices?.active?.binyan).toBe("Pi'el");
    expect(bare(voices!.active!.forms.present.ms)).toMatch(/מבקש/);
    expect(bare(voices!.active!.forms.infinitive)).toMatch(/לבקש/);
  });

  it('reads passive voice (Pu\'al) with present/past/future, empty imperative/infinitive', () => {
    expect(voices?.passive?.binyan).toBe("Pu'al");
    expect(voices!.passive!.forms.present.ms).not.toBe(voices!.active!.forms.present.ms);
    expect(bare(voices!.passive!.forms.present.ms)).toBe('מבקש');
    expect(voices!.passive!.forms.imperative['2ms']).toBe('');
    expect(voices!.passive!.forms.infinitive).toBe('');
  });

  it('extracts see-also entry references (entry links only)', () => {
    const slugs = seeAlso.map((s) => s.slug);
    expect(slugs).toContain('2955-bikush');
    expect(slugs).toContain('256-lehitbakesh');
    expect(slugs).toContain('3000-bakasha');
    expect(slugs).toContain('9321-mevukash');
    // no root-search / pattern / footer links
    expect(seeAlso.every((s) => /^\d+-[^/?#]+$/.test(s.slug))).toBe(true);
    expect(seeAlso.find((s) => s.slug === '2955-bikush')!.label.replace(/\p{Mn}/gu, '')).toMatch(/ביקוש/);
  });

  it('reads adjective inflection forms', () => {
    const result = parseDictPage(`
      <table class="conjugation-table">
        <tr>
          <td><div id="ms-a"><span class="menukad">חָדָשׁ</span></div></td>
          <td><div id="fs-a"><span class="menukad">חֲדָשָׁה</span></div></td>
          <td><div id="mp-a"><span class="menukad">חֲדָשִׁים</span></div></td>
          <td><div id="fp-a"><span class="menukad">חֲדָשׁוֹת</span></div></td>
        </tr>
      </table>
    `);

    expect(result.adjectiveForms).toEqual({
      ms: 'חָדָשׁ',
      fs: 'חֲדָשָׁה',
      mp: 'חֲדָשִׁים',
      fp: 'חֲדָשׁוֹת',
    });
  });
});
