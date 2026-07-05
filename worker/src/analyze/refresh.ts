import type { KVLike } from '../lookup';
import { fetchPricingCatalogue, type CatalogueModel } from './catalogue';
import { writeActiveModels } from './model-registry';
import { grammarMessages, extractGeneratedText } from './llm-parsing';

export const REFRESH_PROBE_TEXT = 'הילדה הלך הביתה';

export async function refreshModels(deps: {
  ai: Ai;
  kv: KVLike;
  fetchImpl: typeof fetch;
  limit?: number;
}): Promise<CatalogueModel[]> {
  const limit = deps.limit ?? 4;
  const candidates = await fetchPricingCatalogue(deps.fetchImpl);
  const working: CatalogueModel[] = [];
  for (const model of candidates) {
    if (working.length >= limit) break;
    try {
      // Use the same options the analyzer uses at analyze time (response_format,
      // temperature, max_tokens) so the probe is a faithful dry-run of a real
      // analyze call. A model that only accepts bare chat but rejects
      // response_format: json_object (not all models support structured output),
      // or a reasoning model that would exhaust a tiny max_tokens budget on
      // reasoning before emitting JSON, must fail here too — otherwise the
      // probe falsely marks it working and it breaks on the first real request.
      const raw = await deps.ai.run(model.id as keyof AiModels, {
        messages: grammarMessages(REFRESH_PROBE_TEXT),
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 3000,
      } as any);
      const text = extractGeneratedText(raw);
      if (typeof text === 'string' && text.trim().length > 0) working.push(model);
    } catch {
      // model unavailable (deprecated/5018) or not generative — skip
    }
  }
  await writeActiveModels(deps.kv, working);
  return working;
}
