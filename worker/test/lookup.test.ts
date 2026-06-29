import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookup, isError, normalizeQuery } from '../src/lookup';
import type { LookupResult } from '../src/types';
import type { Store } from '../src/store';

const f = (n: string) => readFileSync(`test/fixtures/${n}`, 'utf-8');
const searchVerb = f('search-levakesh.html');
const dictVerb = f('dict-levakesh.html');

function fakeFetch(map: Record<string, string>): typeof fetch {
  return (async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const key = Object.keys(map).find((k) => url.includes(k));
    return new Response(key ? map[key] : 'x', { status: key ? 200 : 404 });
  }) as unknown as typeof fetch;
}

function memStore(seed: Record<string, LookupResult> = {}): Store & { puts: number } {
  const m = new Map(Object.entries(seed));
  return {
    puts: 0,
    async get(q: string) { return m.get(q) ?? null; },
    async put(q: string, r: LookupResult) { (this as any).puts++; m.set(q, r); },
  };
}

describe('normalizeQuery', () => {
  it('strips surrounding punctuation', () => {
    expect(normalizeQuery('  «לבקש».  ')).toBe('לבקש');
  });
});

describe('lookup v2 tiers', () => {
  it('serves a verb from Pealim and writes through to the store', async () => {
    const store = memStore();
    const fetchImpl = fakeFetch({ '/search/': searchVerb, '/dict/255-levakesh/': dictVerb });
    const r = await lookup('לבקש', { store, fetchImpl });
    expect(isError(r)).toBe(false);
    if (isError(r)) return;
    expect(r.slug).toBe('255-levakesh');
    expect(r.voices?.active?.binyan).toBe("Pi'el");
    expect(r.voices?.passive?.binyan).toBe("Pu'al");
    expect(r.seeAlso.map((s) => s.slug)).toContain('3000-bakasha');
    expect(store.puts).toBe(1);
  });

  it('serves from the D1 store without touching Pealim (resilience)', async () => {
    const seeded: LookupResult = {
      word: 'לבקש', lemma: 'לְבַקֵּשׁ', slug: '255-levakesh', translation: 'to ask',
      root: 'ב־ק־שׁ', isVerb: true,
      voices: { active: { binyan: "Pi'el", forms: {} as any } }, seeAlso: [],
      sourceUrl: 'https://www.pealim.com/dict/255-levakesh/',
    };
    const store = memStore({ 'לבקש': seeded });
    const fetchImpl = vi.fn(fakeFetch({}));
    const r = await lookup('לבקש', { store, fetchImpl });
    expect(isError(r)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('KV hit short-circuits before the store', async () => {
    const kvVal: LookupResult = {
      word: 'לבקש', lemma: 'x', slug: '1-x', translation: 't', root: 'r', isVerb: false,
      inflectionKind: 'other',
      seeAlso: [], sourceUrl: 'https://e',
    };
    const kv = { get: async () => kvVal, put: async () => {} };
    const store = memStore();
    const fetchImpl = vi.fn(fakeFetch({}));
    const r = await lookup('לבקש', { kv, store, fetchImpl });
    expect(isError(r) ? null : r.slug).toBe('1-x');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes stale non-verb store entries so adjective forms are populated', async () => {
    const stale: LookupResult = {
      word: 'חדש',
      lemma: 'חָדָשׁ',
      slug: '2679-chadash',
      translation: 'new',
      root: 'ח־ד־שׁ',
      isVerb: false,
      seeAlso: [],
      sourceUrl: 'https://www.pealim.com/dict/2679-chadash/',
    };
    const store = memStore({ 'חדש': stale });
    const searchAdjective = `
      <div class="verb-search-result">
        <div class="verb-search-lemma"><a href="/dict/2679-chadash/"><span class="menukad">חָדָשׁ</span></a></div>
        <div class="verb-search-root"><a>ח - ד - שׁ</a></div>
        <div class="verb-search-binyan"><span>Part of speech: adjective</span></div>
        <div class="verb-search-meaning">new</div>
        <div class="verb-search-button"><a>View all forms</a></div>
      </div>
    `;
    const dictAdjective = `
      <table class="conjugation-table">
        <tr>
          <td><div id="ms-a"><span class="menukad">חָדָשׁ</span></div></td>
          <td><div id="fs-a"><span class="menukad">חֲדָשָׁה</span></div></td>
          <td><div id="mp-a"><span class="menukad">חֲדָשִׁים</span></div></td>
          <td><div id="fp-a"><span class="menukad">חֲדָשׁוֹת</span></div></td>
        </tr>
      </table>
    `;
    const fetchImpl = vi.fn(fakeFetch({ '/search/': searchAdjective, '/dict/2679-chadash/': dictAdjective }));

    const r = await lookup('חדש', { store, fetchImpl });

    expect(isError(r)).toBe(false);
    if (isError(r)) return;
    expect(fetchImpl).toHaveBeenCalled();
    expect(r.inflectionKind).toBe('adjective');
    expect(r.adjectiveForms?.mp.replace(/\p{Mn}/gu, '')).toBe('חדשים');
    expect(store.puts).toBe(1);
  });

  it('returns NO_RESULTS when search has no result block', async () => {
    const r = await lookup('zzz', { fetchImpl: fakeFetch({ '/search/': '<html></html>' }) });
    expect(isError(r) && r.code).toBe('NO_RESULTS');
  });

  it('returns UPSTREAM on a non-2xx from Pealim', async () => {
    const r = await lookup('לבקש', { fetchImpl: (async () => new Response('x', { status: 503 })) as any });
    expect(isError(r) && r.code).toBe('UPSTREAM');
  });
});
