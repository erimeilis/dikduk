import { ANALYZE_WORKER_URLS } from '../shared/config';
import type { GrammarResult } from '../contracts/grammar';

// Background-side grammar analysis: try each analyzer Worker URL in order until one
// returns a valid issues payload.
export async function fetchGrammar(text: string): Promise<GrammarResult> {
  let lastError = 'Analyzer failed';
  for (const baseUrl of ANALYZE_WORKER_URLS) {
    try {
      const res = await fetch(`${baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as GrammarResult & { code?: string };
      if (res.ok && 'issues' in data) return { issues: data.issues };
      lastError = 'error' in data ? data.error : `Analyzer returned ${res.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  return { error: lastError };
}
