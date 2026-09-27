import type { KVLike } from '../lookup';
import { fetchPricingCatalogue, type CatalogueModel } from './catalogue';
import { writeActiveModels } from './model-registry';
import { grammarMessages, findsProbeError, parseLlmIssues } from './llm-parsing';

export const REFRESH_PROBE_TEXT = 'הילדה הלך הביתה';
// A correct sentence: a model that reports issues here flags everything.
export const REFRESH_CONTROL_TEXT = 'אני הולך לבית ספר';

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
      const run = (text: string) => deps.ai.run(model.id as keyof AiModels, {
        messages: grammarMessages(text),
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 3000,
      } as any);
      // A model only counts as working if it finds the probe's agreement error
      // AND reports nothing in a correct control sentence. Tiny models return
      // valid-looking JSON that flags everything (or copies the prompt's field
      // names), which would give users junk issues.
      if (!findsProbeError(REFRESH_PROBE_TEXT, await run(REFRESH_PROBE_TEXT))) {
        console.warn('[refresh] skipping model that missed the probe error:', model.id);
      } else if (parseLlmIssues(REFRESH_CONTROL_TEXT, await run(REFRESH_CONTROL_TEXT)).length > 0) {
        console.warn('[refresh] skipping model that flags a correct sentence:', model.id);
      } else {
        working.push(model);
      }
    } catch (e) {
      // model unavailable (deprecated/5018) or not generative — skip it
      console.warn('[refresh] skipping model:', model.id, (e as Error).message);
    }
  }
  if (working.length === 0) {
    // Never replace a working list with an empty one: that silently turns off
    // grammar until the next run (it happened when the pricing page changed format).
    console.error(`[refresh] no working models (catalogue had ${candidates.length}); keeping the previous list`);
    return working;
  }
  await writeActiveModels(deps.kv, working);
  return working;
}
