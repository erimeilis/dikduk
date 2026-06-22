import { parseSearchResults } from './search-parser';
import { parseDictPage } from './dict-parser';
import { normalizeQuery } from './normalize';
import type { LookupResult, LookupError } from './types';

export { normalizeQuery };

export interface KVLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface LookupDeps {
  kv?: KVLike | null;
  fetchImpl?: typeof fetch;
}

const SEARCH_URL = (q: string) => `https://www.pealim.com/search/?q=${encodeURIComponent(q)}`;
const UA = 'Mozilla/5.0 (compatible; PealimLookupExtension/1.0; +https://www.pealim.com)';
const TTL = 2592000; // 30 days

export function isError(r: LookupResult | LookupError): r is LookupError {
  return (r as LookupError).code !== undefined;
}

async function getText(
  doFetch: typeof fetch,
  url: string,
): Promise<{ html: string } | LookupError> {
  try {
    const res = await doFetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { error: `Pealim returned ${res.status}`, code: 'UPSTREAM' };
    return { html: await res.text() };
  } catch (e) {
    console.error('[lookup] fetch failed:', url, e);
    return { error: `Pealim request failed: ${(e as Error).message}`, code: 'UPSTREAM' };
  }
}

export async function lookup(
  rawQuery: string,
  deps: LookupDeps = {},
): Promise<LookupResult | LookupError> {
  const q = normalizeQuery(rawQuery);
  if (!q) return { error: 'Empty query', code: 'NO_RESULTS' };

  const doFetch = deps.fetchImpl ?? fetch;
  const kv = deps.kv ?? null;
  const cacheKey = `lookup:${q}`;

  if (kv) {
    try {
      const cached = (await kv.get(cacheKey, 'json')) as LookupResult | null;
      if (cached) return cached;
    } catch (e) {
      console.error('[lookup] KV get failed:', e);
      // cache miss — continue to fetch
    }
  }

  const search = await getText(doFetch, SEARCH_URL(q));
  if ('code' in search) return search;

  let sr: ReturnType<typeof parseSearchResults>;
  try {
    sr = parseSearchResults(search.html);
  } catch (e) {
    console.error('[lookup] search parse failed:', e);
    return { error: "Couldn't read Pealim's search results", code: 'PARSE' };
  }
  if (!sr) return { error: `No Pealim entry for "${q}"`, code: 'NO_RESULTS' };

  const result: LookupResult = {
    word: q,
    lemma: sr.lemma,
    translation: sr.translation,
    root: sr.root,
    isVerb: sr.isVerb,
    sourceUrl: sr.dictUrl,
  };

  if (sr.isVerb) {
    const dictPage = await getText(doFetch, sr.dictUrl);
    if ('code' in dictPage) return dictPage;
    let parsed: ReturnType<typeof parseDictPage>;
    try {
      parsed = parseDictPage(dictPage.html);
    } catch (e) {
      console.error('[lookup] dict parse failed:', e);
      return { error: "Couldn't read Pealim's conjugation page", code: 'PARSE' };
    }
    const { binyan, conjugation } = parsed;
    if (!conjugation.infinitive && !conjugation.present.ms) {
      console.error('[lookup] dict parse produced no Active-forms data for', sr.dictUrl);
      return { error: "Couldn't read Pealim's conjugation page", code: 'PARSE' };
    }
    if (binyan) result.binyan = binyan;
    result.conjugation = conjugation;
  }

  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: TTL });
    } catch (e) {
      console.error('[lookup] KV put failed:', e);
      // cache write failure is non-fatal — return result anyway
    }
  }
  return result;
}
