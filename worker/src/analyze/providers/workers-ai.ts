import type { Analyzer, AnalyzeError, AnalyzeResult } from '../types';
import type { CatalogueModel } from '../catalogue';
import { grammarMessages, parseLlmIssues } from '../llm-parsing';

// Tries each model in `models` (price-ordered, cheapest first) in turn and
// returns on the first success. Models can be disabled per-account (Workers
// AI error 5018) or otherwise unavailable, so falling through keeps analysis
// working without a deploy when the cheapest model is unreachable.
export class WorkersAiAnalyzer implements Analyzer {
  provider = 'workers-ai' as const;

  constructor(
    private readonly ai: Ai,
    private readonly models: CatalogueModel[],
  ) {}

  async analyze(text: string): Promise<AnalyzeResult | AnalyzeError> {
    let lastError = 'no model available';
    for (const model of this.models) {
      try {
        const raw = await this.ai.run(model.id as keyof AiModels, {
          messages: grammarMessages(text),
          response_format: { type: 'json_object' },
          temperature: 0,
          // kimi-k2.6 is a reasoning model — it spends tokens on reasoning before
          // emitting the JSON answer, so 700 left `content` empty. Give it room.
          max_tokens: 3000,
        } as any);
        return {
          provider: this.provider,
          model: model.id,
          text,
          tokens: [],
          issues: parseLlmIssues(text, raw),
          raw,
        };
      } catch (e) {
        lastError = (e as Error).message;
      }
    }
    return { error: `Workers AI analysis failed: ${lastError}`, code: 'UPSTREAM' };
  }
}
