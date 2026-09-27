import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveAiKey, loadAiKey, clearAiKey, headersFor, aiHeaders, validateAiKey } from '../src/shared/ai-key';

const store: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))),
        set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
        remove: vi.fn(async (keys: string[]) => keys.forEach((k) => delete store[k])),
      },
    },
  };
});

describe('ai-key', () => {
  it('builds headers per provider and none without a key', () => {
    expect(headersFor({ provider: 'gemini', key: 'g' })).toEqual({ Authorization: 'Bearer g', 'X-DikDuk-Provider': 'gemini' });
    expect(headersFor({ provider: 'workers-ai', key: 't', account: 'a' }))
      .toEqual({ Authorization: 'Bearer t', 'X-DikDuk-Provider': 'workers-ai', 'X-DikDuk-Account': 'a' });
    expect(headersFor({ provider: 'owner', key: 'o' })).toEqual({ Authorization: 'Bearer o' });
    expect(headersFor(null)).toEqual({});
  });

  it('round-trips through chrome.storage.local, trimmed', async () => {
    await saveAiKey({ provider: 'gemini', key: ' g \n' });
    expect(await loadAiKey()).toEqual({ provider: 'gemini', key: 'g' });
    expect(await aiHeaders()).toEqual({ Authorization: 'Bearer g', 'X-DikDuk-Provider': 'gemini' });
    await clearAiKey();
    expect(await loadAiKey()).toBeNull();
  });

  it('validates a key before it is saved or tested', () => {
    expect(validateAiKey({ provider: 'gemini', key: '  ' })).toBe('Enter a key first.');
    expect(validateAiKey({ provider: 'workers-ai', key: 't' })).toBe('Enter your Cloudflare account ID.');
    expect(validateAiKey({ provider: 'workers-ai', key: 't', account: 'a' })).toBeNull();
    expect(validateAiKey({ provider: 'owner', key: 'o' })).toBeNull();
  });
});
