import { lookup, isError, statusFor as lookupStatusFor, type KVLike } from './lookup';
import { createD1Store } from './storage/d1-store';
import {
  analyzeHebrew,
  isAnalyzeError,
  statusFor as analyzeStatusFor,
  type AnalyzeEnv,
} from './analyze';
import { refreshModels } from './analyze/refresh';
import {
  translateHebrew,
  isTranslateError,
  statusFor as translateStatusFor,
} from './translate';
import { parseCredentials, isCredentialsError } from './auth/credentials';
import { bindingRunner } from './auth/ai-runner';

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
  // Owner access token (wrangler secret). Unset → owner access disabled.
  OWNER_TOKEN?: string;
}

// Public unauthenticated API — wildcard origin is intentional for extension use.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-DikDuk-Provider, X-DikDuk-Account',
};

// Build JSON responses without relying on the static Response.json() helper,
// which is not available in every test runtime.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

async function fetch(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  // Who pays for AI (spec §3.1), resolved only for the AI endpoints so a bad key
  // never blocks /lookup. Keys are used for this request only, never stored.
  const aiEndpoint = url.pathname === '/analyze' || url.pathname === '/translate';
  const credentials = aiEndpoint ? parseCredentials(request.headers, env.OWNER_TOKEN) : { kind: 'none' as const };
  if (isCredentialsError(credentials)) {
    return json(credentials, credentials.code === 'BAD_KEY' ? 401 : 400);
  }
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
    const month = new Date().toISOString().slice(0, 7);
    const result = await analyzeHebrew(body, {
      env: env as AnalyzeEnv,
      lookupImpl: (query) => lookup(query, {
        kv: env.PEALIM_CACHE ?? null,
        store,
      }),
      kv: env.PEALIM_CACHE,
      month,
      credentials,
    });
    const status = isAnalyzeError(result) ? analyzeStatusFor(result) : 200;
    return json(result, status);
  }

  if (url.pathname === '/translate') {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed', code: 'BAD_REQUEST' }, 405);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
    }

    const result = await translateHebrew(body, {
      credentials,
      ai: env.AI ? bindingRunner(env.AI) : undefined,
      kv: env.PEALIM_CACHE ?? null,
      month: new Date().toISOString().slice(0, 7),
    });
    return json(result, isTranslateError(result) ? translateStatusFor(result) : 200);
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
}

// Daily cron (see wrangler.toml [triggers]): keeps the KV-cached model
// catalogue fresh so /analyze's workers-ai provider always has working,
// price-ordered models instead of failing with NO_MODELS.
async function scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
  if (!env.AI) return;
  await refreshModels({ ai: env.AI, kv: env.PEALIM_CACHE, fetchImpl: globalThis.fetch });
}

export default { fetch, scheduled };
