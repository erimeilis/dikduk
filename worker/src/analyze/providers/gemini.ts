import type { Analyzer, AnalyzeError, AnalyzeRequest, AnalyzeResult } from '../types';
import { grammarPrompt, parseLlmIssues } from '../llm-parsing';
import { safeFetch } from '../../shared/fetch';

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const res = await safeFetch(this.fetchImpl, url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: grammarPrompt(text) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    }, {
      logLabel: 'gemini',
      requestFailed: (message) => `Gemini request failed: ${message}`,
      badStatus: (status) => `Gemini returned ${status}`,
    });
    if (!res.ok) return res.failure;

    try {
      const raw = await res.response.json();
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
