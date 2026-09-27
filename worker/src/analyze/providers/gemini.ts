import type { Analyzer, AnalyzeError, AnalyzeRequest, AnalyzeResult } from '../types';
import { grammarPrompt, parseLlmIssues } from '../llm-parsing';
import { geminiGenerate } from '../../auth/gemini';

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

export class GeminiAnalyzer implements Analyzer {
  provider = 'gemini' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string | undefined,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async analyze(text: string, request: AnalyzeRequest): Promise<AnalyzeResult | AnalyzeError> {
    const model = request.model || this.model || DEFAULT_GEMINI_MODEL;
    const out = await geminiGenerate(this.apiKey, model, {
      contents: [{ role: 'user', parts: [{ text: grammarPrompt(text) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }, this.fetchImpl);
    if (!out.ok) {
      return out.badKey ? { error: 'AI key rejected', code: 'BAD_KEY' } : { error: out.error, code: 'UPSTREAM' };
    }

    try {
      const raw = out.json;
      return {
        provider: this.provider,
        model,
        text,
        tokens: [],
        issues: parseLlmIssues(text, raw),
        raw,
      };
    } catch (e) {
      return { error: `Could not parse Gemini response: ${(e as Error).message}`, code: 'PARSE' };
    }
  }
}
