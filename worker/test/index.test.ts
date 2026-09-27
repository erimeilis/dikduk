import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../src/index';

// Fixture paths are relative to the worker package root (vitest cwd).
const f = (n: string) => readFileSync(`test/fixtures/${n}`, 'utf-8');

const env = { PEALIM_CACHE: null, DB: null } as any;

describe('worker.fetch', () => {
  it('400s when q is missing', async () => {
    const res = await worker.fetch(new Request('https://w/lookup'), env);
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('404s on unknown path', async () => {
    const res = await worker.fetch(new Request('https://w/other'), env);
    expect(res.status).toBe(404);
  });

  it('answers OPTIONS preflight with CORS', async () => {
    const res = await worker.fetch(new Request('https://w/lookup', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/GET/);
  });

  it('returns 200 + JSON for a verb', async () => {
    vi.stubGlobal('fetch', (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      return new Response(url.includes('/dict/') ? f('dict-levakesh.html') : f('search-levakesh.html'), { status: 200 });
    }) as any);
    const res = await worker.fetch(new Request('https://w/lookup?q=' + encodeURIComponent('לבקש')), env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.isVerb).toBe(true);
    expect(body.voices.active.binyan).toBe("Pi'el");
    vi.unstubAllGlobals();
  });

  it('returns analyzer JSON through POST /analyze', async () => {
    vi.stubGlobal('fetch', (async () => new Response(JSON.stringify({
      tokens: [
        {
          token: 'הספר',
          morph: { pos: 'NOUN', feats: { Gender: 'Masc', Number: 'Sing' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'טובה',
          morph: { pos: 'ADJ', feats: { Gender: 'Fem', Number: 'Sing' } },
          syntax: { dep_head_idx: 0, dep_func: 'amod' },
        },
      ],
    }), { status: 200 })) as any);

    const res = await worker.fetch(new Request('https://w/analyze', {
      method: 'POST',
      body: JSON.stringify({ text: 'הספר טובה' }),
    }), { ...env, DICTABERT_ANALYZER_URL: 'https://dicta.example/analyze' });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.provider).toBe('dictabert-http');
    expect(body.issues.map((issue: any) => issue.id)).toContain('adjective_agreement');
    vi.unstubAllGlobals();
  });

  it('translates through POST /translate with the owner token', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'Settings' })) };
    const res = await worker.fetch(new Request('https://w/translate', {
      method: 'POST',
      headers: { authorization: 'Bearer owner-secret' },
      body: JSON.stringify({ text: 'הגדרות' }),
    }), { ...env, AI: ai, OWNER_TOKEN: 'owner-secret' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translation: 'Settings' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('keyless POST /translate never touches the AI binding', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'Settings' })) };
    const res = await worker.fetch(new Request('https://w/translate', {
      method: 'POST', body: JSON.stringify({ text: 'הגדרות' }),
    }), { ...env, AI: ai, OWNER_TOKEN: 'owner-secret' });
    expect(await res.json()).toMatchObject({ code: 'NEEDS_KEY' });
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('allows the credential headers in CORS and 400s malformed credentials', async () => {
    const pre = await worker.fetch(new Request('https://w/translate', { method: 'OPTIONS' }), env);
    const allowed = pre.headers.get('Access-Control-Allow-Headers') ?? '';
    for (const h of ['Authorization', 'X-DikDuk-Provider', 'X-DikDuk-Account']) expect(allowed).toContain(h);
    expect(allowed).not.toContain('X-DikDuk-Key'); // secrets travel only in Authorization
    const bad = await worker.fetch(new Request('https://w/translate', {
      method: 'POST', headers: { authorization: 'Bearer k', 'x-dikduk-provider': 'openai' }, body: '{"text":"הגדרות"}',
    }), env);
    expect(bad.status).toBe(400);
  });

  it('ignores credential headers on /lookup (a bad key never blocks the dictionary)', async () => {
    const res = await worker.fetch(new Request('https://w/lookup', {
      headers: { authorization: 'Bearer wrong' },
    }), { ...env, OWNER_TOKEN: 'owner-secret' });
    expect(res.status).toBe(400); // missing q — not 401 BAD_KEY
  });

  it('405s a GET on /translate', async () => {
    const res = await worker.fetch(new Request('https://w/translate'), env);
    expect(res.status).toBe(405);
  });
});

describe('worker.scheduled', () => {
  function fakeKv() {
    const s = new Map<string, string>();
    return {
      async get(k: string, _t: 'json') { const v = s.get(k); return v ? JSON.parse(v) : null; },
      async put(k: string, v: string) { s.set(k, v); },
      _s: s,
    };
  }

  it('refreshes the grammar model catalogue into KV', async () => {
    const PRICING = '| @cf/good/a | $0.03 per M input tokens  $0.04 per M output tokens | n |';
    vi.stubGlobal('fetch', (async () => new Response(PRICING, { status: 200 })) as any);
    // The refresh keeps only models that find the probe's agreement error (הלך, 6..9).
    const found = JSON.stringify({ issues: [{ id: 'subject_verb_agreement', severity: 'error', message: 'Verb must be feminine', start: 6, end: 9 }] });
    const ai = { run: vi.fn(async (_id: string, input: any) => ({ choices: [{ message: {
      // the control sentence (a correct one) must come back clean
      content: input.messages[1].content.includes('אני הולך לבית ספר') ? '{"issues":[]}' : found,
    } }] })) };
    const kv = fakeKv();

    await (worker as any).scheduled({} as any, { ...env, AI: ai, PEALIM_CACHE: kv }, {} as any);
    vi.unstubAllGlobals();

    const stored = await kv.get('analyze:models:v1', 'json');
    expect(stored).not.toBeNull();
    expect(stored.length).toBeGreaterThan(0);
  });
});
