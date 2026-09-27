import { describe, it, expect } from 'vitest';
import { parseCredentials, isCredentialsError } from '../../src/auth/credentials';

const h = (init: Record<string, string>) => new Headers(init);

describe('parseCredentials', () => {
  it('is none without headers', () => {
    expect(parseCredentials(h({}), 'secret')).toEqual({ kind: 'none' });
  });

  it('accepts the owner token (Bearer without a provider)', () => {
    expect(parseCredentials(h({ authorization: 'Bearer secret' }), 'secret')).toEqual({ kind: 'owner' });
  });

  it('accepts an explicit owner provider', () => {
    expect(parseCredentials(h({ authorization: 'Bearer secret', 'x-dikduk-provider': 'owner' }), 'secret'))
      .toEqual({ kind: 'owner' });
  });

  it('rejects a wrong owner token as BAD_KEY', () => {
    const r = parseCredentials(h({ authorization: 'Bearer nope' }), 'secret');
    expect(isCredentialsError(r) && r.code).toBe('BAD_KEY');
  });

  it('bearer without a server secret is BAD_KEY', () => {
    const r = parseCredentials(h({ authorization: 'Bearer anything' }), undefined);
    expect(isCredentialsError(r) && r.code).toBe('BAD_KEY');
  });

  it('matches a server secret stored with a trailing newline', () => {
    expect(parseCredentials(h({ authorization: 'Bearer secret' }), 'secret\n')).toEqual({ kind: 'owner' });
  });

  it('reads a gemini key from Authorization', () => {
    expect(parseCredentials(h({ authorization: 'Bearer g-key', 'x-dikduk-provider': 'gemini' }), 'secret'))
      .toEqual({ kind: 'gemini', apiKey: 'g-key' });
  });

  it('reads a workers-ai token and account', () => {
    expect(parseCredentials(h({ authorization: 'Bearer cf-tok', 'x-dikduk-provider': 'workers-ai', 'x-dikduk-account': 'acc1' }), 'secret'))
      .toEqual({ kind: 'workers-ai', apiToken: 'cf-tok', accountId: 'acc1' });
  });

  it('trims pasted keys and accepts any provider case', () => {
    expect(parseCredentials(h({ authorization: 'Bearer   g-key \t', 'x-dikduk-provider': ' Gemini ' }), undefined))
      .toEqual({ kind: 'gemini', apiKey: 'g-key' });
  });

  it('rejects malformed credentials with BAD_REQUEST', () => {
    for (const init of <Record<string, string>[]>[
      { authorization: 'Bearer k', 'x-dikduk-provider': 'openai' },
      { 'x-dikduk-provider': 'gemini' },
      { authorization: 'Bearer', 'x-dikduk-provider': 'gemini' },
      { authorization: 'Bearer k', 'x-dikduk-provider': 'workers-ai' },
    ]) {
      const r = parseCredentials(h(init), 'secret');
      expect(isCredentialsError(r) && r.code).toBe('BAD_REQUEST');
    }
  });
});
