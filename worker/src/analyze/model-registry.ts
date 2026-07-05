import type { KVLike } from '../lookup';
import type { CatalogueModel } from './catalogue';

export const ACTIVE_MODELS_KEY = 'analyze:models:v1';

export async function readActiveModels(kv: KVLike): Promise<CatalogueModel[]> {
  try {
    const raw = (await kv.get(ACTIVE_MODELS_KEY, 'json')) as CatalogueModel[] | null;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (m) => m && typeof m.id === 'string' && typeof m.inUsdPerM === 'number' && typeof m.outUsdPerM === 'number',
    );
  } catch {
    return [];
  }
}

export async function writeActiveModels(kv: KVLike, models: CatalogueModel[]): Promise<void> {
  await kv.put(ACTIVE_MODELS_KEY, JSON.stringify(models));
}
