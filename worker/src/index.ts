import { lookup, isError, type KVLike } from './lookup';
import { createD1Store } from './store';

// PEALIM_CACHE is typed as the narrow KVLike our code uses, not the
// workers-types `KVNamespace` global. The runtime binding is a full
// KVNamespace (a superset), but keeping this file free of workers-types
// globals lets the Node-typed test project (tsconfig.test.json) import it.
export interface Env {
  PEALIM_CACHE: KVLike;
  DB: D1Database;
}

// Public, read-only, unauthenticated GET lookup — wildcard origin is intentional.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    const status = isError(result) ? (result.code === 'NO_RESULTS' ? 404 : 502) : 200;
    return json(result, status);
  },
};
