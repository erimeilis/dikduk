import { parseSearchResults } from './search-parser';
import { parseDictPage } from './dict-parser';
import { normalizeQuery } from './normalize';
import type { Store } from './store';
import type { LookupResult, LookupError } from './types';

export { normalizeQuery };

export interface KVLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface LookupDeps {
  kv?: KVLike | null;
  store?: Store | null;
  fetchImpl?: typeof fetch;
}

const SEARCH_URL = (q: string) => `https://www.pealim.com/search/?q=${encodeURIComponent(q)}`;
const UA = 'Mozilla/5.0 (compatible; PealimLookupExtension/1.0; +https://www.pealim.com)';
const TTL = 2592000; // 30 days

export function isError(r: LookupResult | LookupError): r is LookupError {
  return (r as LookupError).code !== undefined;
}

async function getText(doFetch: typeof fetch, url: string): Promise<{ html: string } | LookupError> {
  try {
    const res = await doFetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { error: `Pealim returned ${res.status}`, code: 'UPSTREAM' };
    return { html: await res.text() };
  } catch (e) {
    console.error('[lookup] fetch failed:', url, e);
    return { error: `Pealim request failed: ${(e as Error).message}`, code: 'UPSTREAM' };
  }
}

export async function lookup(rawQuery: string, deps: LookupDeps = {}): Promise<LookupResult | LookupError> {
  const q = normalizeQuery(rawQuery);
  if (!q) return { error: 'Empty query', code: 'NO_RESULTS' };

  const doFetch = deps.fetchImpl ?? fetch;
  const kv = deps.kv ?? null;
  const store = deps.store ?? null;
  const cacheKey = `lookup:${q}`;

  // Tier 1: KV
  if (kv) {
    try {
      const cached = (await kv.get(cacheKey, 'json')) as LookupResult | null;
      if (cached) return cached;
    } catch (e) {
      console.error('[lookup] KV get failed:', e);
    }
  }

  // Tier 2: D1
  if (store) {
    try {
      const stored = await store.get(q);
      if (stored) {
        if (kv) {
          try { await kv.put(cacheKey, JSON.stringify(stored), { expirationTtl: TTL }); }
          catch (e) { console.error('[lookup] KV put failed:', e); }
        }
        return stored;
      }
    } catch (e) {
      console.error('[lookup] store get failed:', e);
    }
  }

  // Tier 3: Pealim
  const search = await getText(doFetch, SEARCH_URL(q));
  if ('code' in search) return search;
  const sr = parseSearchResults(search.html);
  if (!sr) return { error: `No Pealim entry for "${q}"`, code: 'NO_RESULTS' };

  const dictPage = await getText(doFetch, sr.dictUrl);
  if ('code' in dictPage) return dictPage;

  let parsed;
  try {
    parsed = parseDictPage(dictPage.html);
  } catch (e) {
    console.error('[lookup] dict parse failed:', e);
    return { error: "Couldn't read Pealim's page", code: 'PARSE' };
  }

  if (parsed.voices?.active && !parsed.voices.active.binyan && sr.binyan) {
    parsed.voices.active.binyan = sr.binyan;
  }

  const result: LookupResult = {
    word: q,
    lemma: sr.lemma,
    slug: sr.slug,
    translation: sr.translation,
    root: sr.root,
    isVerb: sr.isVerb,
    seeAlso: parsed.seeAlso,
    sourceUrl: sr.dictUrl,
  };
  if (parsed.voices) result.voices = parsed.voices;

  if (sr.isVerb && !result.voices?.active) {
    console.error('[lookup] verb with no active conjugation for', sr.dictUrl);
    return { error: "Couldn't read Pealim's conjugation page", code: 'PARSE' };
  }

  if (store) {
    try { await store.put(q, result); } catch (e) { console.error('[lookup] store put failed:', e); }
  }
  if (kv) {
    try { await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: TTL }); }
    catch (e) { console.error('[lookup] KV put failed:', e); }
  }
  return result;
}
