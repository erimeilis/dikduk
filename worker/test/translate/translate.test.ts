import { describe, it, expect, vi } from 'vitest';
import {
  translateHebrew,
  cacheKey,
  isTranslateError,
  statusFor,
  TRANSLATE_MODEL,
  GEMINI_TRANSLATE_MODEL,
} from '../../src/translate';
import { spendKey } from '../../src/analyze/metering';

function fakeKv(initial: Record<string, unknown> = {}) {
  const store = new Map<string, string>(
    Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]),
  );
  return {
    store,
    get: vi.fn(async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null)),
    put: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  };
}

function fakeAi(output: unknown = { response: 'Settings', usage: { prompt_tokens: 110, completion_tokens: 2 } }) {
  return { run: vi.fn(async () => output) };
}

const month = '2026-09';

describe('translateHebrew', () => {
  it('rejects missing, too long, and non-Hebrew text', async () => {
    const ai = fakeAi();
    for (const body of [{}, { text: '' }, { text: 'hello' }, { text: 'א'.repeat(201) }, null]) {
      const r = await translateHebrew(body, { ai, kv: null, month });
      expect(isTranslateError(r) && r.code).toBe('BAD_REQUEST');
    }
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('accepts mixed Hebrew and Latin text', async () => {
    const ai = fakeAi({ response: 'Open Chrome' });
    const r = await translateHebrew({ text: 'פתח את Chrome' }, { ai, kv: null, month });
    expect(r).toEqual({ translation: 'Open Chrome' });
  });

  it('calls the model on a cache miss and stores the result', async () => {
    const ai = fakeAi();
    const kv = fakeKv();
    const r = await translateHebrew({ text: '  הגדרות ' }, { ai, kv, month });
    expect(r).toEqual({ translation: 'Settings' });
    expect(ai.run).toHaveBeenCalledWith(TRANSLATE_MODEL.id, {
      messages: [
        { role: 'system', content: expect.stringContaining('user-interface labels') },
        { role: 'user', content: 'הגדרות' },
      ],
      max_tokens: 30,
      temperature: 0,
    });
    expect(kv.store.get(await cacheKey('הגדרות'))).toBe(JSON.stringify('Settings'));
  });

  it('caches translations forever (no expiration)', async () => {
    const kv = fakeKv();
    await translateHebrew({ text: 'הגדרות' }, { ai: fakeAi(), kv, month });
    const call = kv.put.mock.calls.find(([k]) => k.startsWith('translate:'));
    expect(call).toBeDefined();
    expect(call!.length).toBe(2);
  });

  it('serves a cache hit without calling the model or the budget', async () => {
    const ai = fakeAi();
    const kv = fakeKv({ [await cacheKey('הגדרות')]: 'Settings', [spendKey(month)]: 99 });
    const r = await translateHebrew({ text: 'הגדרות' }, { ai, kv, month });
    expect(r).toEqual({ translation: 'Settings' });
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('keys the cache by model, so a model change never serves old translations', async () => {
    const key = await cacheKey('הגדרות');
    expect(key.startsWith(`translate:v2:${TRANSLATE_MODEL.id}:`)).toBe(true);
  });

  it('shares one cache key across niqqud variants', async () => {
    expect(await cacheKey('שָׁלוֹם')).toBe(await cacheKey('שלום'));
  });

  it('returns BUDGET without calling the model once the month is spent', async () => {
    const ai = fakeAi();
    const kv = fakeKv({ [spendKey(month)]: 5 });
    const r = await translateHebrew({ text: 'הגדרות' }, { ai, kv, month });
    expect(isTranslateError(r) && r.code).toBe('BUDGET');
    expect(isTranslateError(r) && statusFor(r)).toBe(200);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('records spend after a model call', async () => {
    const kv = fakeKv();
    await translateHebrew({ text: 'הגדרות' }, { ai: fakeAi(), kv, month });
    const spent = JSON.parse(kv.store.get(spendKey(month))!);
    expect(spent).toBeGreaterThan(0);
  });

  it('maps a model failure to UPSTREAM 502', async () => {
    const ai = { run: vi.fn(async () => { throw new Error('5018: model unavailable'); }) };
    const r = await translateHebrew({ text: 'הגדרות' }, { ai, kv: null, month });
    expect(isTranslateError(r) && r.code).toBe('UPSTREAM');
    expect(isTranslateError(r) && statusFor(r)).toBe(502);
  });

  it('maps an empty model answer to UPSTREAM', async () => {
    const r = await translateHebrew({ text: 'הגדרות' }, { ai: fakeAi({ response: ' ' }), kv: null, month });
    expect(isTranslateError(r) && r.code).toBe('UPSTREAM');
  });

  it('strips quotes and a trailing period the model wraps around the label', async () => {
    const r = await translateHebrew({ text: 'הגדרות' }, { ai: fakeAi({ response: '"Settings."' }), kv: null, month });
    expect(r).toEqual({ translation: 'Settings' });
  });

  it('keeps only the first line and leaves an ellipsis intact', async () => {
    const multi = await translateHebrew({ text: 'הגדרות' }, { ai: fakeAi({ response: 'Settings\nThis is the settings menu.' }), kv: null, month });
    expect(multi).toEqual({ translation: 'Settings' });
    const ellipsis = await translateHebrew({ text: 'הדפסה' }, { ai: fakeAi({ response: 'Print...' }), kv: null, month });
    expect(ellipsis).toEqual({ translation: 'Print...' });
  });

  it('uses the model id chosen by the quality probe', () => {
    expect(TRANSLATE_MODEL.id).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  });

  it('translates without KV', async () => {
    const r = await translateHebrew({ text: 'הגדרות' }, { ai: fakeAi(), kv: null, month });
    expect(r).toEqual({ translation: 'Settings' });
  });

  it('returns UPSTREAM when no AI binding is configured', async () => {
    const r = await translateHebrew({ text: 'הגדרות' }, { kv: null, month });
    expect(isTranslateError(r) && r.code).toBe('UPSTREAM');
  });
});

describe('translateHebrew with credentials', () => {
  const geminiOk = (text: string) => vi.fn(async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), { status: 200 }));

  it('keyless cache miss returns NEEDS_KEY (200) and calls nothing', async () => {
    const ai = fakeAi();
    const r = await translateHebrew({ text: 'הגדרות' }, { credentials: { kind: 'none' }, ai, kv: fakeKv(), month });
    expect(isTranslateError(r) && r.code).toBe('NEEDS_KEY');
    expect(isTranslateError(r) && statusFor(r)).toBe(200);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('keyless request is served from the Llama cache', async () => {
    const kv = fakeKv({ [await cacheKey('הגדרות')]: 'Settings' });
    expect(await translateHebrew({ text: 'הגדרות' }, { credentials: { kind: 'none' }, kv, month }))
      .toEqual({ translation: 'Settings' });
  });

  it('keyless request finds a Gemini-cached label', async () => {
    const kv = fakeKv({ [await cacheKey('הגדרות', GEMINI_TRANSLATE_MODEL)]: 'Settings' });
    expect(await translateHebrew({ text: 'הגדרות' }, { credentials: { kind: 'none' }, kv, month }))
      .toEqual({ translation: 'Settings' });
  });

  it('gemini key translates via Gemini, caches under the Gemini model, spends nothing', async () => {
    const kv = fakeKv();
    const fetchImpl = geminiOk('Settings');
    const r = await translateHebrew({ text: 'הגדרות' }, { credentials: { kind: 'gemini', apiKey: 'g' }, kv, month, fetchImpl: fetchImpl as any });
    expect(r).toEqual({ translation: 'Settings' });
    expect(kv.store.get(await cacheKey('הגדרות', GEMINI_TRANSLATE_MODEL))).toBe(JSON.stringify('Settings'));
    expect(kv.store.has(spendKey(month))).toBe(false);
  });

  it('bad gemini key is BAD_KEY (401)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 }));
    const r = await translateHebrew({ text: 'הגדרות' }, { credentials: { kind: 'gemini', apiKey: 'g' }, kv: null, month, fetchImpl: fetchImpl as any });
    expect(isTranslateError(r) && r.code).toBe('BAD_KEY');
    expect(isTranslateError(r) && statusFor(r)).toBe(401);
  });

  it('workers-ai key runs Llama over REST and spends nothing on the owner budget', async () => {
    const kv = fakeKv();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, result: { response: 'Settings' } }), { status: 200 }));
    const r = await translateHebrew({ text: 'הגדרות' }, {
      credentials: { kind: 'workers-ai', apiToken: 't', accountId: 'a' }, kv, month, fetchImpl: fetchImpl as any,
    });
    expect(r).toEqual({ translation: 'Settings' });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain(`/accounts/a/ai/run/${TRANSLATE_MODEL.id}`);
    expect(kv.store.has(spendKey(month))).toBe(false);
  });

  it('bad workers-ai token is BAD_KEY', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000 }] }), { status: 400 }));
    const r = await translateHebrew({ text: 'הגדרות' }, {
      credentials: { kind: 'workers-ai', apiToken: 't', accountId: 'a' }, kv: null, month, fetchImpl: fetchImpl as any,
    });
    expect(isTranslateError(r) && r.code).toBe('BAD_KEY');
  });

  it('never logs a user key when the provider call throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await translateHebrew({ text: 'הגדרות' }, {
      credentials: { kind: 'workers-ai', apiToken: 'secret-token', accountId: 'a' }, kv: null, month,
      fetchImpl: (async () => { throw new Error('network down'); }) as any,
    });
    await translateHebrew({ text: 'הגדרות' }, {
      credentials: { kind: 'gemini', apiKey: 'secret-gemini' }, kv: null, month,
      fetchImpl: (async () => { throw new Error('network down'); }) as any,
    });
    const logged = JSON.stringify([...spy.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain('secret-token');
    expect(logged).not.toContain('secret-gemini');
    spy.mockRestore();
    warn.mockRestore();
  });
});
