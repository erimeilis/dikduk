import { lookup, isError, statusFor as lookupStatusFor, type KVLike } from './lookup';
import { createD1Store } from './storage/d1-store';
import {
  analyzeHebrew,
  isAnalyzeError,
  statusFor as analyzeStatusFor,
  type AnalyzeEnv,
} from './analyze';

// PEALIM_CACHE is typed as the narrow KVLike our code uses, not the
// workers-types `KVNamespace` global. The runtime binding is a full
// KVNamespace (a superset), but keeping this file free of workers-types
// globals lets the Node-typed test project (tsconfig.test.json) import it.
export interface Env {
  PEALIM_CACHE: KVLike;
  DB: D1Database;
  DICTABERT_ANALYZER_URL?: string;
  DICTABERT_ANALYZER_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  AI?: Ai;
}

// Public unauthenticated API — wildcard origin is intentional for extension use.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Build JSON responses without relying on the static Response.json() helper,
// which is not available in every test runtime.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    if (url.pathname === '/analyze') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed', code: 'BAD_REQUEST' }, 405);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
      }

      const store = env.DB ? createD1Store(env.DB) : null;
      const result = await analyzeHebrew(body, {
        env: env as AnalyzeEnv,
        lookupImpl: (query) => lookup(query, {
          kv: env.PEALIM_CACHE ?? null,
          store,
        }),
      });
      const status = isAnalyzeError(result) ? analyzeStatusFor(result) : 200;
      return json(result, status);
    }

    if (url.pathname !== '/lookup') {
      return json({ error: 'Not found', code: 'NO_RESULTS' }, 404);
    }

    const q = url.searchParams.get('q') ?? '';
    if (!q.trim()) {
      return json({ error: 'Missing q parameter', code: 'NO_RESULTS' }, 400);
    }

    const result = await lookup(q, {
      kv: env.PEALIM_CACHE ?? null,
      store: env.DB ? createD1Store(env.DB) : null,
    });
    const status = isError(result) ? lookupStatusFor(result) : 200;
    return json(result, status);
  },
};
