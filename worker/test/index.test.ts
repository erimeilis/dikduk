import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../src/index';

// Fixture paths are relative to the worker package root (vitest cwd).
const f = (n: string) => readFileSync(`test/fixtures/${n}`, 'utf-8');

const env = { PEALIM_CACHE: null } as any;

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
    vi.unstubAllGlobals();
  });
});
