import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePricingCatalogue } from '../../src/analyze/catalogue';

const md = readFileSync('test/fixtures/pricing.md', 'utf8');

describe('parsePricingCatalogue', () => {
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
