import type { KVLike } from '../lookup';
import type { CatalogueModel } from './catalogue';

export const MONTHLY_BUDGET_USD = 5;

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

export function estimateCostUsd(usage: Usage | undefined, model: CatalogueModel): number {
  if (!usage) return 0;
  const inTok = usage.prompt_tokens ?? 0;
  const outTok = usage.completion_tokens ?? 0;
  return (inTok / 1_000_000) * model.inUsdPerM + (outTok / 1_000_000) * model.outUsdPerM;
}

export function spendKey(month: string): string {
  return `analyze:spend:${month}`;
}

export async function isOverBudget(kv: KVLike, month: string): Promise<boolean> {
  try {
    const spent = (await kv.get(spendKey(month), 'json')) as number | null;
    return typeof spent === 'number' && spent >= MONTHLY_BUDGET_USD;
  } catch {
    return false;
  }
}

export async function recordSpend(kv: KVLike, month: string, usd: number): Promise<void> {
  const spent = ((await kv.get(spendKey(month), 'json')) as number | null) ?? 0;
  await kv.put(spendKey(month), JSON.stringify(spent + usd), { expirationTtl: 60 * 60 * 24 * 62 });
}
