import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGrammar } from '../src/spellcheck/grammar-service';
import { ANALYZE_WORKER_URLS, WORKER_URL } from '../src/shared/config';

function jsonResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('fetchGrammar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers a structured error over a later generic thrown error', async () => {
    expect(ANALYZE_WORKER_URLS.length).toBeGreaterThanOrEqual(2);
    const fetchMock = vi
      .fn()
      // URL1: structured, non-ok error with a code.
      .mockResolvedValueOnce(
        jsonResponse(false, 503, { error: 'No grammar models available', code: 'NO_MODELS' }),
      )
      // URL2: throws a generic network exception (no code).
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGrammar('טקסט לבדיקה');

    expect(result).toEqual({ error: 'No grammar models available', code: 'NO_MODELS' });
    expect(fetchMock).toHaveBeenCalledTimes(ANALYZE_WORKER_URLS.length);
  });

  it('returns the generic error when no URL produces a structured error', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('first network error'))
      .mockRejectedValueOnce(new Error('second network error'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGrammar('טקסט לבדיקה');

    expect(result).toEqual({ error: 'second network error', code: undefined });
  });

  it('returns issues on success without needing every URL', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(true, 200, { issues: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGrammar('טקסט לבדיקה');

    expect(result).toEqual({ issues: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the stored AI key headers', async () => {
    (globalThis as any).chrome = {
      storage: { local: { get: vi.fn(async () => ({ aiProvider: 'gemini', aiKey: 'g' })) } },
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('no local worker')) // localhost dev fallback down
      .mockResolvedValue(jsonResponse(true, 200, { issues: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchGrammar('טקסט לבדיקה');
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url.startsWith(WORKER_URL)).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer g');
    delete (globalThis as any).chrome;
  });

  it('sends a key only to the production worker, never to localhost', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(false, 503, { error: 'x', code: 'NO_MODELS' }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchGrammar('טקסט לבדיקה', { Authorization: 'Bearer secret' });
    for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      const auth = (init.headers as Record<string, string>).Authorization;
      if (url.startsWith(WORKER_URL)) expect(auth).toBe('Bearer secret');
      else expect(auth).toBeUndefined();
    }
    expect(fetchMock).toHaveBeenCalledTimes(ANALYZE_WORKER_URLS.length);
  });
});
