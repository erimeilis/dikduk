import { ANALYZE_WORKER_URLS, WORKER_URL } from '../shared/config';
import type { GrammarResult } from '../contracts/grammar';
import { aiHeaders } from '../shared/ai-key';

// Background-side grammar analysis: try each analyzer Worker URL in order until one
// returns a valid issues payload.
// `keyHeaders` overrides the stored key (the popup's Test uses it to try a key
// without saving it).
export async function fetchGrammar(text: string, keyHeaders?: Record<string, string>): Promise<GrammarResult> {
  let lastError = 'Analyzer failed';
  let lastCode: string | undefined;
  // A structured error (one that carries a `code`, e.g. NO_MODELS/BUDGET) from an
  // earlier URL must survive later URLs' generic/thrown errors, otherwise the caller
  // loses the code (e.g. controller.ts's BUDGET friendly-copy branch) to a less
  // actionable message.
  let structuredError: { error: string; code: string } | undefined;
  // The user's own AI key pays for analysis. It goes only to the production
  // worker over HTTPS — never to the localhost dev fallback, which any local
  // process could be listening on.
  const credentials = keyHeaders ?? (await aiHeaders());
  for (const baseUrl of ANALYZE_WORKER_URLS) {
    try {
      const res = await fetch(`${baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(baseUrl === WORKER_URL ? credentials : {}) },
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
