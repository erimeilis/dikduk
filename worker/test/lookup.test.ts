import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookup, isError, normalizeQuery } from '../src/lookup';

// Fixture paths are relative to the worker package root (vitest cwd).
const f = (n: string) => readFileSync(`test/fixtures/${n}`, 'utf-8');
const searchVerb = f('search-levakesh.html');
const dict = f('dict-levakesh.html');
const searchAdj = f('search-mevukash.html');

function fakeFetch(map: Record<string, string>): typeof fetch {
  return (async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const key = Object.keys(map).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(map[key], { status: 200 });
  }) as unknown as typeof fetch;
}

describe('normalizeQuery', () => {
  it('strips surrounding punctuation and whitespace', () => {
    expect(normalizeQuery('  «לבקש».  ')).toBe('לבקש');
  });
});

describe('lookup', () => {
  it('returns a full verb result (search + dict)', async () => {
    const fetchImpl = fakeFetch({ '/search/': searchVerb, '/dict/255-levakesh/': dict });
    const r = await lookup('לבקש', { fetchImpl });
    expect(isError(r)).toBe(false);
    if (isError(r)) return;
    expect(r.isVerb).toBe(true);
    expect(r.binyan).toBe("Pi'el");
    expect(r.conjugation!.infinitive.replace(/\p{Mn}/gu, '')).toMatch(/לבקש/);
    expect(r.translation.toLowerCase()).toMatch(/ask|request/);
  });

  it('returns a non-verb result without fetching a dict page', async () => {
    const dictSpy = vi.fn();
    const fetchImpl = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/dict/')) dictSpy();
      return new Response(searchAdj, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await lookup('מבוקש', { fetchImpl });
    expect(isError(r)).toBe(false);
    if (isError(r)) return;
    expect(r.isVerb).toBe(false);
    expect(r.conjugation).toBeUndefined();
    expect(dictSpy).not.toHaveBeenCalled();
  });

  it('returns NO_RESULTS when search has no result block', async () => {
    const fetchImpl = fakeFetch({ '/search/': '<html><body>empty</body></html>' });
    const r = await lookup('zzz', { fetchImpl });
    expect(isError(r) && r.code).toBe('NO_RESULTS');
  });

  it('returns UPSTREAM on non-2xx from Pealim', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 503 })) as unknown as typeof fetch;
    const r = await lookup('לבקש', { fetchImpl });
    expect(isError(r) && r.code).toBe('UPSTREAM');
  });

  it('falls back to fetch when KV get throws', async () => {
    const kv = {
      get: async (): Promise<unknown> => { throw new Error('kv down'); },
      put: async () => {},
    };
    const fetchImpl = fakeFetch({ '/search/': searchVerb, '/dict/255-levakesh/': dict });
    const r = await lookup('לבקש', { kv, fetchImpl });
    expect(isError(r)).toBe(false);
    if (isError(r)) return;
    expect(r.isVerb).toBe(true);
  });

  it('returns PARSE when a verb dict page has no Active-forms data', async () => {
    const dictEmpty = f('dict-empty.html');
    const fetchImpl = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      return new Response(url.includes('/dict/') ? dictEmpty : searchVerb, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await lookup('לבקש', { fetchImpl });
    expect(isError(r) && r.code).toBe('PARSE');
  });

  it('serves from KV cache on the second call', async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
      put: async (k: string, v: string) => void store.set(k, v),
    };
    const fetchImpl = vi.fn(fakeFetch({ '/search/': searchVerb, '/dict/255-levakesh/': dict }));
    await lookup('לבקש', { kv, fetchImpl });
    const callsAfterFirst = fetchImpl.mock.calls.length;
    await lookup('לבקש', { kv, fetchImpl });
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst); // no new fetches
  });
});
