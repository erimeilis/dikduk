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
      const raw = await deps.ai.run(model.id as keyof AiModels, {
        messages: grammarMessages(REFRESH_PROBE_TEXT),
        max_tokens: 32,
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
