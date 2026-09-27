import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePricingCatalogue } from '../../src/analyze/catalogue';

const md = readFileSync('test/fixtures/pricing.md', 'utf8');

describe('parsePricingCatalogue', () => {
  it('reads rows where input and output prices are split by <br> (page format since 2026-09)', () => {
    // Verbatim row from the live pricing page, 2026-09-26.
    const row = '| @cf/meta/llama-3.2-1b-instruct | $0.027 per M input tokens <br> $0.201 per M output tokens | 2457 neurons per M input tokens <br> 18252 neurons per M output tokens |';
    expect(parsePricingCatalogue(row)).toEqual([
      { id: '@cf/meta/llama-3.2-1b-instruct', inUsdPerM: 0.027, outUsdPerM: 0.201 },
    ]);
  });

  it('extracts token-priced models, sorted cheapest-output first, skipping image models', () => {
    const models = parsePricingCatalogue(md);
    expect(models.map((m) => m.id)).toEqual([
      '@cf/meta/llama-3.2-1b-instruct',
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/mistralai/mistral-small-3.1-24b-instruct',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ]);
    expect(models[0]).toEqual({ id: '@cf/meta/llama-3.2-1b-instruct', inUsdPerM: 0.027, outUsdPerM: 0.201 });
  });
});
