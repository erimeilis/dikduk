import type { Analyzer, AnalyzeError, AnalyzeRequest, AnalyzeResult } from '../types';
import { grammarMessages, parseLlmIssues, pickWorkersAiModel } from '../llm-parsing';

export class WorkersAiAnalyzer implements Analyzer {
  provider = 'workers-ai' as const;

  constructor(private readonly ai: Ai) {}

  async analyze(text: string, request: AnalyzeRequest): Promise<AnalyzeResult | AnalyzeError> {
    const model = pickWorkersAiModel(request.model);
    try {
      const raw = await this.ai.run(model, {
        messages: grammarMessages(text),
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 700,
      } as any);
      return {
        provider: this.provider,
        model,
        text,
        tokens: [],
        issues: parseLlmIssues(text, raw),
        raw,
      };
    } catch (e) {
      return { error: `Workers AI analysis failed: ${(e as Error).message}`, code: 'UPSTREAM' };
    }
  }
}
