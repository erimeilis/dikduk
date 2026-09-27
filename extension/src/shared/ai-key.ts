// The user's own AI key (spec §5). chrome.storage.local only — never sync —
// and not encrypted at rest, which PRIVACY.md states.
export type AiProvider = 'gemini' | 'workers-ai' | 'owner';

export interface AiKey {
  provider: AiProvider;
  key: string;
  account?: string;
}

const KEYS = ['aiProvider', 'aiKey', 'aiAccount'] as const;

export async function loadAiKey(): Promise<AiKey | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  const got = (await chrome.storage.local.get([...KEYS])) as Record<string, string | undefined>;
  const provider = got.aiProvider as AiProvider | undefined;
  if (!provider || !got.aiKey) return null;
  return got.aiAccount ? { provider, key: got.aiKey, account: got.aiAccount } : { provider, key: got.aiKey };
}

export async function saveAiKey(value: AiKey): Promise<void> {
  const key = value.key.trim();
  const account = value.account?.trim();
  await chrome.storage.local.set({ aiProvider: value.provider, aiKey: key, aiAccount: account ?? '' });
}

export async function clearAiKey(): Promise<void> {
  await chrome.storage.local.remove([...KEYS]);
}

// Secrets travel only in Authorization; X-DikDuk-Provider says whose key it is.
export function headersFor(value: AiKey | null): Record<string, string> {
  if (!value) return {};
  const headers: Record<string, string> = { Authorization: `Bearer ${value.key.trim()}` };
  if (value.provider === 'owner') return headers;
  headers['X-DikDuk-Provider'] = value.provider;
  if (value.provider === 'workers-ai' && value.account) headers['X-DikDuk-Account'] = value.account.trim();
  return headers;
}

// Why a key can't be saved or tested yet, or null when it is complete.
export function validateAiKey(value: AiKey): string | null {
  if (!value.key.trim()) return 'Enter a key first.';
  if (value.provider === 'workers-ai' && !value.account?.trim()) return 'Enter your Cloudflare account ID.';
  return null;
}

export async function aiHeaders(): Promise<Record<string, string>> {
  return headersFor(await loadAiKey());
}
