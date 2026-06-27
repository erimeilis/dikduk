import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadUserDict, addUserWord, isEnabled, setEnabled } from '../src/spellcheck/userdict';

const store: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  // minimal chrome.storage.local stub
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
      },
    },
  };
});

describe('userdict', () => {
  it('loads an empty set when nothing stored', async () => {
    expect([...(await loadUserDict())]).toEqual([]);
  });
  it('adds a word and reloads it (deduped)', async () => {
    await addUserWord('שלום');
    await addUserWord('שלום');
    expect([...(await loadUserDict())]).toEqual(['שלום']);
  });
  it('enabled defaults to true and can be toggled', async () => {
    expect(await isEnabled()).toBe(true);
    await setEnabled(false);
    expect(await isEnabled()).toBe(false);
  });
});
