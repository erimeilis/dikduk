import { WORKER_URL } from '../shared/config';
import { cacheKeyFor } from './cache-key';
import type { LookupResponse } from '../contracts/lookup';

// Background-side lookup: read the local cache, otherwise fetch from the Worker
// and cache successful results.
export async function fetchLookup(word: string): Promise<LookupResponse> {
  const key = cacheKeyFor(word);

  try {
    const cached = await chrome.storage.local.get(key);
    if (cached[key]) return cached[key] as LookupResponse;
  } catch (e) {
    console.error('[dikduk] storage read failed:', e);
  }

  try {
    const res = await fetch(`${WORKER_URL}/lookup?q=${encodeURIComponent(word)}`);
    const data = (await res.json()) as LookupResponse;
    if (!('code' in data)) {
      try {
        await chrome.storage.local.set({ [key]: data });
      } catch (e) {
        console.error('[dikduk] storage write failed:', e);
      }
    }
    return data;
  } catch (e) {
    console.error('[dikduk] worker fetch failed:', e);
    return { error: `Lookup failed: ${(e as Error).message}`, code: 'UPSTREAM' };
  }
}
