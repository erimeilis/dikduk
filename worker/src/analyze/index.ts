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
import { deriveStructuralIssues } from './rules';
import { enrichStructuralIssues } from './enrichment';

// Public re-exports kept stable for consumers and tests.
export { normalizeDictaBertPayload } from './dictabert-parser';
export { deriveStructuralIssues } from './rules';
export { WORKERS_AI_GRAMMAR_MODELS } from './llm-parsing';
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
const PROVIDER_REGISTRY: Record<AnalysisProvider, (ctx: ProviderContext) => Analyzer | null> = {
  'dictabert-http': ({ env, fetchImpl, lookupImpl }) => {
    if (!env.DICTABERT_ANALYZER_URL) return null;
    return new DictaBertOrchestrator(
      new DictaBertHttpAnalyzer(env.DICTABERT_ANALYZER_URL, env.DICTABERT_ANALYZER_TOKEN, fetchImpl),
      lookupImpl,
    );
  },
  'workers-ai': ({ env }) => (env.AI ? new WorkersAiAnalyzer(env.AI) : null),
  'gemini': ({ env, fetchImpl }) =>
    env.GEMINI_API_KEY ? new GeminiAnalyzer(env.GEMINI_API_KEY, env.GEMINI_MODEL, fetchImpl) : null,
};

// When no provider is requested, fall back to DictaBERT if it is configured.
const DEFAULT_PROVIDER: AnalysisProvider = 'dictabert-http';

export function isAnalyzeError(result: AnalyzeResult | AnalyzeError): result is AnalyzeError {
  return (result as AnalyzeError).code !== undefined;
}

// Map an analyze error code to its HTTP status.
export function statusFor(error: AnalyzeError): number {
  if (error.code === 'BAD_REQUEST') return 400;
  if (error.code === 'NO_PROVIDER') return 503;
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
  const analyzer = createAnalyzer(provider, deps);
  if (!analyzer) {
    return {
      error: 'No analysis provider configured',
      code: 'NO_PROVIDER',
    };
  }

  return analyzer.analyze(text, {
    text,
    provider,
    model: typeof input.model === 'string' ? input.model : undefined,
  });
}

function isAnalysisProvider(provider: unknown): provider is AnalysisProvider {
  return typeof provider === 'string' && Object.prototype.hasOwnProperty.call(PROVIDER_REGISTRY, provider);
}

function createAnalyzer(provider: AnalysisProvider | undefined, deps: AnalyzeDeps): Analyzer | null {
  const ctx: ProviderContext = {
    env: deps.env ?? {},
    fetchImpl: deps.fetchImpl ?? ((input, init) => fetch(input, init)),
    lookupImpl: deps.lookupImpl,
  };
  const factory = PROVIDER_REGISTRY[provider ?? DEFAULT_PROVIDER];
  return factory(ctx);
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
