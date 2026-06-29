import { describe, it, expect } from 'vitest';
import { cacheKeyFor } from '../src/lookup/cache-key';

describe('cacheKeyFor', () => {
  it('namespaces and trims the word', () => {
    expect(cacheKeyFor('  לבקש ')).toBe('dikduk:v2:לבקש');
  });
});
