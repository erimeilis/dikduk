import type { KVLike } from '../lookup';
import type { CatalogueModel } from '../analyze/catalogue';
import { estimateCostUsd, isOverBudget, recordSpend, type Usage } from '../analyze/metering';
import { normalizeHebrew } from '../shared/hebrew';
import { restRunner, BadKeyError, type AiRunner } from '../auth/ai-runner';
import { geminiGenerate, geminiText } from '../auth/gemini';
import type { Credentials } from '../auth/credentials';

// Workers AI model for UI-label translation. Chosen by a live probe on 20 real
// Chrome labels (2026-09-24): llama-3.3-70b 19/20 vs m2m100 ~8/20 — the plain
// MT model translates labels as prose ("settled" for הגדרות). Pricing from the
// Cloudflare model page: $0.293 / M input, $2.253 / M output tokens.
export const TRANSLATE_MODEL: CatalogueModel = {
  id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  inUsdPerM: 0.293,
  outUsdPerM: 2.253,
};
export const MAX_TRANSLATE_CHARS = 200;
const SYSTEM_PROMPT =
  'You translate Hebrew software user-interface labels (menu items, buttons, settings) into the short English label a UI would show. Reply with only the English label, nothing else.';
const HEBREW_LETTER = /[א-ת]/;

// The owner's Workers AI binding, narrowed so tests can pass a plain fake.
export type TranslateAi = AiRunner;

export interface TranslateDeps {
  // Who pays. index.ts always passes it; the owner default keeps direct callers
  // (tests) on the metered owner path.
  credentials?: Credentials;
  ai?: AiRunner;
  kv?: KVLike | null;
  month?: string;
  fetchImpl?: typeof fetch;
}

// Gemini model for callers who bring a Google AI Studio key.
export const GEMINI_TRANSLATE_MODEL = 'gemini-3.1-flash-lite';

export type TranslateErrorCode = 'BAD_REQUEST' | 'BUDGET' | 'UPSTREAM' | 'NEEDS_KEY' | 'BAD_KEY';
export interface TranslateError {
  error: string;
  code: TranslateErrorCode;
}
export type TranslateResult = { translation: string } | TranslateError;

export function isTranslateError(result: TranslateResult): result is TranslateError {
  return 'code' in result;
}

// Same mapping as /analyze: BUDGET and NEEDS_KEY are paused states, not failures.
export function statusFor(error: TranslateError): number {
  if (error.code === 'BAD_REQUEST') return 400;
  if (error.code === 'BUDGET' || error.code === 'NEEDS_KEY') return 200;
  if (error.code === 'BAD_KEY') return 401;
  return 502;
}

// Entries never expire, so the key carries the model id: switching models
// starts a fresh cache instead of serving the old model's answers forever.
export async function cacheKey(text: string, modelId: string = TRANSLATE_MODEL.id): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeHebrew(text.trim()));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `translate:v2:${modelId}:${hex}`;
}

function badRequest(error: string): TranslateError {
  return { error, code: 'BAD_REQUEST' };
}

// The model sometimes wraps its answer in quotes, ends it with a period, or adds
// an explanation line. Keep the first line; drop one trailing period but never
// an ellipsis ("Print..." is a real UI label). Results are cached forever, so
// this is the last chance to keep chatter out of the cache.
function cleanLabel(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const firstLine = raw.trim().split(/\r?\n/)[0] ?? '';
  return firstLine.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/(?<!\.)\.$/, '').trim();
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function translateHebrew(body: unknown, deps: TranslateDeps): Promise<TranslateResult> {
  const raw = (body as { text?: unknown } | null)?.text;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return badRequest('Missing text');
  if (text.length > MAX_TRANSLATE_CHARS) return badRequest(`text longer than ${MAX_TRANSLATE_CHARS} characters`);
  if (!HEBREW_LETTER.test(text)) return badRequest('text contains no Hebrew');

  const { kv, month } = deps;
  const credentials: Credentials = deps.credentials ?? { kind: 'owner' };
  const fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const modelId = credentials.kind === 'gemini' ? GEMINI_TRANSLATE_MODEL : TRANSLATE_MODEL.id;
  // Keyless callers may read any model's cached answer; payers read their own model's.
  const readModels = credentials.kind === 'none' ? [TRANSLATE_MODEL.id, GEMINI_TRANSLATE_MODEL] : [modelId];

  if (kv) {
    for (const model of readModels) {
      try {
        const hit = await kv.get(await cacheKey(text, model), 'json');
        if (typeof hit === 'string') return { translation: hit };
      } catch (err) {
        console.warn('translate: cache read failed', err);
      }
    }
  }
  if (credentials.kind === 'none') return { error: 'AI key required', code: 'NEEDS_KEY' };

  let answer: string;
  let usage: Usage | undefined;
  try {
    if (credentials.kind === 'gemini') {
      const out = await geminiGenerate(credentials.apiKey, GEMINI_TRANSLATE_MODEL, {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 256 },
      }, fetchImpl);
      if (!out.ok) return out.badKey ? badKey() : { error: `Translation failed: ${out.error}`, code: 'UPSTREAM' };
      answer = geminiText(out.json);
    } else {
      let runner: AiRunner;
      if (credentials.kind === 'workers-ai') {
        runner = restRunner(credentials.accountId, credentials.apiToken, fetchImpl);
      } else {
        if (!deps.ai) return { error: 'Translation model not configured', code: 'UPSTREAM' };
        // The budget counter lives in KV, so without KV there is nothing to enforce:
        // translation still works (the endpoint must not fail on a missing cache),
        // unmetered. In production PEALIM_CACHE is always bound. The pool is shared
        // with /analyze by design (one $5 monthly AI budget for the whole worker).
        if (kv && month && (await isOverBudget(kv, month))) {
          return { error: 'Monthly translation budget reached', code: 'BUDGET' };
        }
        runner = deps.ai;
      }
      const output = await runner.run(TRANSLATE_MODEL.id, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        max_tokens: 30,
        temperature: 0,
      });
      answer = String((output as { response?: unknown } | null)?.response ?? '');
      usage = (output as { usage?: Usage } | null)?.usage;
    }
  } catch (err) {
    if (err instanceof BadKeyError) return badKey();
    console.error('translate: model call failed', messageOf(err));
    return { error: `Translation failed: ${messageOf(err)}`, code: 'UPSTREAM' };
  }

  const translation = cleanLabel(answer);
  if (!translation) {
    console.error('translate: model returned no text');
    return { error: 'Translation model returned no text', code: 'UPSTREAM' };
  }

  if (kv) {
    try {
      // No TTL: a label's translation doesn't change, so it is cached forever.
      await kv.put(await cacheKey(text, modelId), JSON.stringify(translation));
    } catch (err) {
      console.warn('translate: cache write failed', err);
    }
    // Only the owner's own calls are metered on the owner's budget.
    if (credentials.kind === 'owner' && month) {
      // Fall back to ~2 characters per token if the model reports no usage.
      const spent: Usage = usage ?? {
        prompt_tokens: Math.ceil(text.length / 2),
        completion_tokens: Math.ceil(translation.length / 2),
      };
      try {
        await recordSpend(kv, month, estimateCostUsd(spent, TRANSLATE_MODEL));
      } catch (err) {
        console.warn('translate: spend record failed', err);
      }
    }
  }
  return { translation };
}

function badKey(): TranslateError {
  return { error: 'AI key rejected', code: 'BAD_KEY' };
}
