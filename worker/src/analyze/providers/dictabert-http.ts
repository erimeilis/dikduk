import type { AnalysisToken, AnalyzeError } from '../types';
import { normalizeDictaBertPayload } from '../dictabert-parser';
import { safeFetch } from '../../shared/fetch';

// Transport + payload normalization for the DictaBERT HTTP analyzer.
// Rules and enrichment are applied by the orchestrator, not here.
export class DictaBertHttpAnalyzer {
  readonly provider = 'dictabert-http' as const;
  readonly model = 'dictabert-joint';

  constructor(
    private readonly endpoint: string,
    private readonly token: string | undefined,
    private readonly fetchImpl: typeof fetch,
  ) {}

  // Fetch the analyzer response. UPSTREAM on transport failure or non-2xx.
  async request(text: string): Promise<{ ok: true; response: Response } | { ok: false; failure: AnalyzeError }> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    const res = await safeFetch(this.fetchImpl, this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, output_style: 'json' }),
    }, {
      logLabel: 'analyze',
      requestFailed: (message) => `Analyzer request failed: ${message}`,
      badStatus: (status) => `Analyzer returned ${status}`,
    });
    if (!res.ok) return { ok: false, failure: res.failure };
    return { ok: true, response: res.response };
  }

  // Map a raw analyzer payload into analysis tokens.
  normalize(text: string, raw: unknown): AnalysisToken[] {
    return normalizeDictaBertPayload(text, raw);
  }
}
