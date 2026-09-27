export type GeminiOutcome = { ok: true; json: unknown } | { ok: false; badKey: boolean; error: string };

// generateContent with an API key in the header (never in the URL, so it can't
// leak into logs). Invalid keys come back as 400 API_KEY_INVALID, or 401/403.
export async function geminiGenerate(
  apiKey: string,
  model: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<GeminiOutcome> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[gemini] fetch failed:', (e as Error).message);
    return { ok: false, badKey: false, error: `Gemini request failed: ${(e as Error).message}` };
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, json };
  const reasons = ((json as { error?: { details?: { reason?: string }[] } }).error?.details ?? []).map((d) => d.reason);
  const badKey = res.status === 401 || res.status === 403 || reasons.includes('API_KEY_INVALID');
  console.error('[gemini] upstream status', res.status, badKey ? '(key rejected)' : '');
  return { ok: false, badKey, error: `Gemini returned ${res.status}` };
}

export function geminiText(json: unknown): string {
  const parts = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}
