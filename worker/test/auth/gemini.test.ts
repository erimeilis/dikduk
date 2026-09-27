import { describe, it, expect, vi } from 'vitest';
import { geminiGenerate, geminiText } from '../../src/auth/gemini';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('geminiGenerate', () => {
  it('sends the key in x-goog-api-key, never in the URL', async () => {
    const fetchImpl = vi.fn(async () => json(200, { candidates: [] }));
    await geminiGenerate('g-secret', 'gemini-x', { contents: [] }, fetchImpl as any);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
    expect(url).not.toContain('g-secret');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-secret');
  });

  it('geminiGenerate maps API_KEY_INVALID to badKey', async () => {
    const out = await geminiGenerate('bad', 'm', {}, (async () =>
      json(400, { error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })) as any);
    expect(out).toEqual({ ok: false, badKey: true, error: 'Gemini returned 400' });
  });

  it('maps 401/403 to badKey and other failures to a plain error', async () => {
    expect(await geminiGenerate('k', 'm', {}, (async () => json(403, {})) as any))
      .toEqual({ ok: false, badKey: true, error: 'Gemini returned 403' });
    expect(await geminiGenerate('k', 'm', {}, (async () => json(500, {})) as any))
      .toEqual({ ok: false, badKey: false, error: 'Gemini returned 500' });
  });

  it('never logs the key', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await geminiGenerate('g-secret', 'm', {}, (async () => { throw new Error('net down'); }) as any);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('g-secret');
    spy.mockRestore();
  });

  it('extracts the first candidate text', () => {
    expect(geminiText({ candidates: [{ content: { parts: [{ text: 'Settings' }] } }] })).toBe('Settings');
    expect(geminiText({})).toBe('');
  });
});
