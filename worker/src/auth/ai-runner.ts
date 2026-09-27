// One interface for "run a Workers AI model": the owner's binding, or the
// Cloudflare REST API with a user's own token (billed to their account).
export interface AiRunner {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export class BadKeyError extends Error {}

export function bindingRunner(ai: Ai): AiRunner {
  return { run: (model, input) => ai.run(model as keyof AiModels, input as any) };
}

// Cloudflare API error code for an invalid or under-scoped token.
const CF_AUTH_ERROR = 10000;
// Workers AI error for a model that requires the Workers Paid plan (HTTP 403).
const CF_PAID_PLAN_ONLY = 5035;

export function restRunner(accountId: string, apiToken: string, fetchImpl: typeof fetch): AiRunner {
  return {
    async run(model, input) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        result?: unknown;
        errors?: { code?: number; message?: string }[];
      };
      if (res.ok && body.success !== false) return body.result;
      const codes = (body.errors ?? []).map((e) => e.code);
      // 403 + 5035 means "this model needs the Workers Paid plan" — the key is
      // fine, the model just isn't available on the caller's plan, so it's a
      // plain failure (the grammar analyzer then tries its next model).
      const paidPlanOnly = codes.includes(CF_PAID_PLAN_ONLY);
      if (!paidPlanOnly && (res.status === 401 || res.status === 403 || codes.includes(CF_AUTH_ERROR))) {
        console.error('[workers-ai-rest] key rejected, status', res.status);
        throw new BadKeyError('AI key rejected');
      }
      const detail = (body.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ');
      console.error('[workers-ai-rest] status', res.status, detail);
      throw new Error(`Workers AI returned ${res.status}${detail ? ` (${detail})` : ''}`);
    },
  };
}
