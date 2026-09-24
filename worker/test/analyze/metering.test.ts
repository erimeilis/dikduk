import { describe, it, expect } from 'vitest';
import { estimateCostUsd, isOverBudget, recordSpend, spendKey, MONTHLY_BUDGET_USD } from '../../src/analyze/metering';

const model = { id: '@cf/x/y', inUsdPerM: 1, outUsdPerM: 2 };

function fakeKv(init: Record<string, unknown> = {}) {
  const s = new Map<string, string>(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { async get(k: string) { const v = s.get(k); return v ? JSON.parse(v) : null; },
           async put(k: string, v: string) { s.set(k, v); } };
}

describe('metering', () => {
  it('estimates cost from token usage and per-M prices', () => {
    // 1M input @ $1 + 0.5M output @ $2 = 1 + 1 = 2
    expect(estimateCostUsd({ prompt_tokens: 1_000_000, completion_tokens: 500_000 }, model)).toBeCloseTo(2);
    expect(estimateCostUsd(undefined, model)).toBe(0);
  });
  it('trips the breaker at the monthly cap', async () => {
    const kv = fakeKv({ [spendKey('2026-07')]: MONTHLY_BUDGET_USD });
    expect(await isOverBudget(kv, '2026-07')).toBe(true);
    expect(await isOverBudget(fakeKv(), '2026-07')).toBe(false);
  });
  it('accumulates spend', async () => {
    const kv = fakeKv();
    await recordSpend(kv, '2026-07', 1.5);
    await recordSpend(kv, '2026-07', 2.0);
    expect(await isOverBudget(kv, '2026-07')).toBe(false);
    await recordSpend(kv, '2026-07', 2.0); // 5.5 total
    expect(await isOverBudget(kv, '2026-07')).toBe(true);
  });
});
