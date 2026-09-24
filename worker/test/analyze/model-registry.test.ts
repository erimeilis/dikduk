import { describe, it, expect } from 'vitest';
import { readActiveModels, writeActiveModels, ACTIVE_MODELS_KEY } from '../../src/analyze/model-registry';

function fakeKv(initial: Record<string, unknown> = {}) {
  const store = new Map<string, string>(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    async get(key: string, _t: 'json') { const v = store.get(key); return v ? JSON.parse(v) : null; },
    async put(key: string, value: string) { store.set(key, value); },
    _store: store,
  };
}

describe('model registry', () => {
  it('returns [] when unset', async () => {
    expect(await readActiveModels(fakeKv())).toEqual([]);
  });
  it('round-trips models', async () => {
    const kv = fakeKv();
    const models = [{ id: '@cf/a/b', inUsdPerM: 0.1, outUsdPerM: 0.2 }];
    await writeActiveModels(kv, models);
    expect(await readActiveModels(kv)).toEqual(models);
    expect(kv._store.has(ACTIVE_MODELS_KEY)).toBe(true);
  });
});
