import { describe, it, expect, vi } from 'vitest';
import { analyzeHebrew, isAnalyzeError, statusFor } from '../../src/analyze';

describe('analyzeHebrew with credentials', () => {
  it('keyless without a DictaBERT sidecar returns NEEDS_KEY', async () => {
    const r = await analyzeHebrew({ text: 'הספר טובה' }, { credentials: { kind: 'none' }, env: { AI: {} as any } });
    expect(isAnalyzeError(r) && r.code).toBe('NEEDS_KEY');
    expect(isAnalyzeError(r) && statusFor(r)).toBe(200);
  });

  it('gemini key uses the user key, not the server GEMINI_API_KEY', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"issues":[]}' }] } }],
    }), { status: 200 }));
    const r = await analyzeHebrew({ text: 'הספר טובה' }, {
      credentials: { kind: 'gemini', apiKey: 'user-key' },
      env: { GEMINI_API_KEY: 'server-key' },
      fetchImpl: fetchImpl as any,
    });
    expect(isAnalyzeError(r)).toBe(false);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('user-key');
  });

  it('bad gemini key is BAD_KEY (401)', async () => {
    const r = await analyzeHebrew({ text: 'הספר טובה' }, {
      credentials: { kind: 'gemini', apiKey: 'bad' },
      fetchImpl: (async () => new Response('{}', { status: 401 })) as any,
    });
    expect(isAnalyzeError(r) && r.code).toBe('BAD_KEY');
    expect(isAnalyzeError(r) && statusFor(r)).toBe(401);
  });

  it('workers-ai key runs the catalogue over REST without touching the budget', async () => {
    const store = new Map<string, string>([
      ['analyze:models:v1', JSON.stringify([{ id: '@cf/a/m', inUsdPerM: 1, outUsdPerM: 1 }])],
      ['analyze:spend:2026-09', JSON.stringify(99)],
    ]);
    const kv = { get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null), put: vi.fn(async () => {}) };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      success: true, result: { choices: [{ message: { content: '{"issues":[]}' } }] },
    }), { status: 200 }));
    const r = await analyzeHebrew({ text: 'הספר טובה' }, {
      credentials: { kind: 'workers-ai', apiToken: 't', accountId: 'a' },
      kv, month: '2026-09', fetchImpl: fetchImpl as any,
    });
    expect(isAnalyzeError(r)).toBe(false); // over-budget owner counter doesn't block user keys
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('bad workers-ai token is BAD_KEY', async () => {
    const store = new Map([['analyze:models:v1', JSON.stringify([{ id: '@cf/a/m', inUsdPerM: 1, outUsdPerM: 1 }])]]);
    const kv = { get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null), put: vi.fn(async () => {}) };
    const r = await analyzeHebrew({ text: 'הספר טובה' }, {
      credentials: { kind: 'workers-ai', apiToken: 't', accountId: 'a' }, kv, month: '2026-09',
      fetchImpl: (async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000 }] }), { status: 400 })) as any,
    });
    expect(isAnalyzeError(r) && r.code).toBe('BAD_KEY');
  });
});
