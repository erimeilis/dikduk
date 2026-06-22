import { describe, it, expect } from 'vitest';
import { cacheKeyFor } from '../src/cache-key';

describe('cacheKeyFor', () => {
  it('namespaces and trims the word', () => {
    expect(cacheKeyFor('  לבקש ')).toBe('pealim:v2:לבקש');
  });
});
