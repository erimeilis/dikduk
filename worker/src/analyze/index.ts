import type {
  AnalysisProvider,
  Analyzer,
  AnalyzeDeps,
  AnalyzeEnv,
  AnalyzeError,
  AnalyzeRequest,
  AnalyzeResult,
  MorphologyLookup,
} from './types';
import { DictaBertHttpAnalyzer } from './providers/dictabert-http';
import { WorkersAiAnalyzer } from './providers/workers-ai';
import { GeminiAnalyzer } from './providers/gemini';
import { bindingRunner, restRunner, type AiRunner } from '../auth/ai-runner';
import { deriveStructuralIssues } from './rules';
import { enrichStructuralIssues } from './enrichment';
import { readActiveModels } from './model-registry';
import { isOverBudget, recordSpend, estimateCostUsd, type Usage } from './metering';

// Public re-exports kept stable for consumers and tests.
export { normalizeDictaBertPayload } from './dictabert-parser';
export { deriveStructuralIssues } from './rules';
export type {
  AnalysisProvider,
  AnalysisSeverity,
  AnalysisToken,
  AnalyzeEnv,
  AnalyzeError,
  AnalyzeErrorCode,
  AnalyzeRequest,
  AnalyzeResult,
  GrammarIssue,
  GrammarReplacement,
  IssueSource,
} from './types';

const MAX_TEXT_LENGTH = 2000;

interface ProviderContext {
  env: AnalyzeEnv;
  fetchImpl: typeof fetch;
  lookupImpl: MorphologyLookup | undefined;
}

// Provider registry: each entry returns a configured Analyzer, or null when the
// environment lacks what that provider needs. `isAnalysisProvider` and the
// default-provider resolution both derive from these keys.
//
// 'workers-ai' is handled separately in `analyzeHebrew` (see
// `runWorkersAi` below): its models come from the KV-sourced, price-ordered
// catalogue and it is metered against the monthly budget, both of which are
// async and need `deps.kv`/`deps.month` rather than just `env`. It still
// appears here (returning null) so `isAnalysisProvider`/default-provider
// resolution keep working uniformly across all three provider keys.
const PROVIDER_REGISTRY: Record<AnalysisProvider, (ctx: ProviderContext) => Analyzer | null> = {
  'dictabert-http': ({ env, fetchImpl, lookupImpl }) => {
    if (!env.DICTABERT_ANALYZER_URL) return null;
    return new DictaBertOrchestrator(
      new DictaBertHttpAnalyzer(env.DICTABERT_ANALYZER_URL, env.DICTABERT_ANALYZER_TOKEN, fetchImpl),
      lookupImpl,
    );
  },
  'workers-ai': () => null,
  'gemini': ({ env, fetchImpl }) =>
    env.GEMINI_API_KEY ? new GeminiAnalyzer(env.GEMINI_API_KEY, env.GEMINI_MODEL, fetchImpl) : null,
};

// When no provider is requested, prefer DictaBERT, then fall back to any other
// configured provider (registry order) so a deployment without the DictaBERT
// sidecar still analyzes via Workers AI / Gemini instead of returning NO_PROVIDER.
const DEFAULT_PROVIDER: AnalysisProvider = 'dictabert-http';

export function isAnalyzeError(result: AnalyzeResult | AnalyzeError): result is AnalyzeError {
  return (result as AnalyzeError).code !== undefined;
}

// Map an analyze error code to its HTTP status.
export function statusFor(error: AnalyzeError): number {
  if (error.code === 'BAD_REQUEST') return 400;
  if (error.code === 'NO_PROVIDER') return 503;
  if (error.code === 'NO_MODELS') return 503;
  // BUDGET is not a client/server error — grammar analysis is simply paused
  // for the rest of the month, so the caller gets a 200 with an error body.
  if (error.code === 'BUDGET') return 200;
  if (error.code === 'NEEDS_KEY') return 200;
  if (error.code === 'BAD_KEY') return 401;
  return 502;
}

export async function analyzeHebrew(
  request: unknown,
  deps: AnalyzeDeps = {},
): Promise<AnalyzeResult | AnalyzeError> {
  const input = request && typeof request === 'object' ? request as Partial<AnalyzeRequest> : {};
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) return { error: 'Missing text', code: 'BAD_REQUEST' };
  if (text.length > MAX_TEXT_LENGTH) {
    return { error: `Text is too long; max ${MAX_TEXT_LENGTH} characters`, code: 'BAD_REQUEST' };
  }

  const provider = isAnalysisProvider(input.provider) ? input.provider : undefined;
  const analyzeRequest: AnalyzeRequest = {
    text,
    provider,
    model: typeof input.model === 'string' ? input.model : undefined,
  };

  const ctx: ProviderContext = {
    env: deps.env ?? {},
    fetchImpl: deps.fetchImpl ?? ((input, init) => fetch(input, init)),
    lookupImpl: deps.lookupImpl,
  };

  const credentials = deps.credentials ?? { kind: 'owner' as const };
  if (credentials.kind === 'none') {
    // The DictaBERT sidecar is not a metered AI provider; everything else needs a key.
    const sidecar = PROVIDER_REGISTRY['dictabert-http'](ctx);
    return sidecar ? sidecar.analyze(text, analyzeRequest) : { error: 'AI key required', code: 'NEEDS_KEY' };
  }
  if (credentials.kind === 'gemini') {
    return new GeminiAnalyzer(credentials.apiKey, ctx.env.GEMINI_MODEL, ctx.fetchImpl).analyze(text, analyzeRequest);
  }
  if (credentials.kind === 'workers-ai') {
    return runWorkersAi(deps, analyzeRequest, {
      runner: restRunner(credentials.accountId, credentials.apiToken, ctx.fetchImpl),
      metered: false,
    });
  }

  // 'workers-ai' needs an async KV read (model catalogue) and budget check,
  // so it can't live in the synchronous PROVIDER_REGISTRY. Try it explicitly
  // when requested, or as part of default-provider fallback when no other
  // provider is configured.
  if (provider === 'workers-ai') {
    return runWorkersAi(deps, analyzeRequest, ownerAccess(ctx.env));
  }
  if (provider) {
    const analyzer = PROVIDER_REGISTRY[provider](ctx);
    if (!analyzer) return { error: 'No analysis provider configured', code: 'NO_PROVIDER' };
    return analyzer.analyze(text, analyzeRequest);
  }

  const candidates: AnalysisProvider[] = [
    ...new Set([DEFAULT_PROVIDER, ...(Object.keys(PROVIDER_REGISTRY) as AnalysisProvider[])]),
  ];
  for (const key of candidates) {
    if (key === 'workers-ai') {
      if (!ctx.env.AI) continue;
      const result = await runWorkersAi(deps, analyzeRequest, ownerAccess(ctx.env));
      // Fall through to the next candidate only when workers-ai itself isn't
      // usable (no models configured); BUDGET and analysis outcomes are final.
      if (!isAnalyzeError(result) || result.code !== 'NO_MODELS') return result;
      continue;
    }
    const analyzer = PROVIDER_REGISTRY[key](ctx);
    if (analyzer) return analyzer.analyze(text, analyzeRequest);
  }
  return { error: 'No analysis provider configured', code: 'NO_PROVIDER' };
}

// Guards the workers-ai path with the KV-sourced model catalogue and the
// monthly spend cap, then runs the analyzer and meters successful usage.
async function runWorkersAi(
  deps: AnalyzeDeps,
  request: AnalyzeRequest,
  access: { runner: AiRunner; metered: boolean } | null,
): Promise<AnalyzeResult | AnalyzeError> {
  if (!access) return { error: 'No analysis provider configured', code: 'NO_PROVIDER' };

  const kv = deps.kv;
  const month = deps.month;
  if (access.metered && kv && month && (await isOverBudget(kv, month))) {
    return { error: 'Monthly grammar budget reached', code: 'BUDGET' };
  }

  const models = kv ? await readActiveModels(kv) : [];
  if (models.length === 0) {
    return { error: 'No grammar models available', code: 'NO_MODELS' };
  }

  const analyzer: Analyzer = new WorkersAiAnalyzer(access.runner, models);
  const result = await analyzer.analyze(request.text, request);

  if (access.metered && !isAnalyzeError(result) && kv && month) {
    const winningModel = models.find((m) => m.id === result.model);
    if (winningModel) {
      const usage = (result.raw as { usage?: Usage } | undefined)?.usage;
      await recordSpend(kv, month, estimateCostUsd(usage, winningModel));
    }
  }

  return result;
}

function isAnalysisProvider(provider: unknown): provider is AnalysisProvider {
  return typeof provider === 'string' && Object.prototype.hasOwnProperty.call(PROVIDER_REGISTRY, provider);
}

// Wraps the DictaBERT transport adapter: it owns rules + enrichment so the
// adapter stays a pure transport/normalization layer.
class DictaBertOrchestrator implements Analyzer {
  provider: AnalysisProvider = 'dictabert-http';

  constructor(
    private readonly transport: DictaBertHttpAnalyzer,
    private readonly lookupImpl: MorphologyLookup | undefined,
  ) {}

  async analyze(text: string): Promise<AnalyzeResult | AnalyzeError> {
    const transport = await this.transport.request(text);
    if (!transport.ok) return transport.failure;

    // Everything from reading the body through normalization, rule derivation,
    // and enrichment maps any thrown error to PARSE (matching the upstream
    // single try/catch boundary).
    try {
      const raw = await transport.response.json();
      const tokens = this.transport.normalize(text, raw);
      const issues = await enrichStructuralIssues(tokens, deriveStructuralIssues(tokens), this.lookupImpl);
      return { provider: this.provider, model: this.transport.model, text, tokens, issues, raw };
    } catch (e) {
      return { error: `Could not parse analyzer response: ${(e as Error).message}`, code: 'PARSE' };
    }
  }
}

// The owner's own access: their Workers AI binding, metered on the monthly budget.
function ownerAccess(env: AnalyzeEnv): { runner: AiRunner; metered: boolean } | null {
  return env.AI ? { runner: bindingRunner(env.AI), metered: true } : null;
}
