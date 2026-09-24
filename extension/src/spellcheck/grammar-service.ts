import { ANALYZE_WORKER_URLS } from '../shared/config';
import type { GrammarResult } from '../contracts/grammar';

// Background-side grammar analysis: try each analyzer Worker URL in order until one
// returns a valid issues payload.
export async function fetchGrammar(text: string): Promise<GrammarResult> {
  let lastError = 'Analyzer failed';
  let lastCode: string | undefined;
  // A structured error (one that carries a `code`, e.g. NO_MODELS/BUDGET) from an
  // earlier URL must survive later URLs' generic/thrown errors, otherwise the caller
  // loses the code (e.g. controller.ts's BUDGET friendly-copy branch) to a less
  // actionable message.
  let structuredError: { error: string; code: string } | undefined;
  for (const baseUrl of ANALYZE_WORKER_URLS) {
    try {
      const res = await fetch(`${baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as GrammarResult;
      if (res.ok && 'issues' in data) return { issues: data.issues };
      const error = 'error' in data ? data.error : `Analyzer returned ${res.status}`;
      const code = 'code' in data ? data.code : undefined;
      lastError = error;
      lastCode = code;
      if (code && !structuredError) structuredError = { error, code };
    } catch (e) {
      lastError = (e as Error).message;
      lastCode = undefined;
    }
  }
  if (structuredError) return structuredError;
  return { error: lastError, code: lastCode };
}
