// Who pays for an AI call, resolved once per request from its headers.
export type Credentials =
  | { kind: 'owner' }
  | { kind: 'gemini'; apiKey: string }
  | { kind: 'workers-ai'; apiToken: string; accountId: string }
  | { kind: 'none' };

export interface CredentialsError {
  error: string;
  code: 'BAD_REQUEST' | 'BAD_KEY';
}

export function isCredentialsError(value: Credentials | CredentialsError): value is CredentialsError {
  return 'code' in value;
}

// Constant-time string comparison, so the owner token can't be probed by timing.
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const badRequest = (error: string): CredentialsError => ({ error, code: 'BAD_REQUEST' });

// Every secret travels in `Authorization: Bearer <secret>` — the standard
// credential header that log redaction targets, never a custom header — and
// `X-DikDuk-Provider` says whose secret it is: absent/`owner`
// → the owner token, `gemini` → a Gemini key, `workers-ai` → a Cloudflare API
// token (with `X-DikDuk-Account`).
export function parseCredentials(headers: Headers, ownerToken: string | undefined): Credentials | CredentialsError {
  const auth = headers.get('authorization')?.trim();
  const provider = headers.get('x-dikduk-provider')?.trim().toLowerCase() || undefined;
  if (!auth && !provider) return { kind: 'none' };
  const secret = (auth ?? '').replace(/^Bearer(\s+|$)/i, '').trim();

  if (!provider || provider === 'owner') {
    // No secret configured → owner access is impossible (fail closed).
    const expected = ownerToken?.trim();
    if (!expected || !secret || !safeEqual(secret, expected)) return { error: 'AI key rejected', code: 'BAD_KEY' };
    return { kind: 'owner' };
  }
  if (!secret) return badRequest('Missing Authorization: Bearer <key>');
  if (provider === 'gemini') return { kind: 'gemini', apiKey: secret };
  if (provider === 'workers-ai') {
    const accountId = headers.get('x-dikduk-account')?.trim();
    if (!accountId) return badRequest('Missing X-DikDuk-Account for workers-ai');
    return { kind: 'workers-ai', apiToken: secret, accountId };
  }
  return badRequest('X-DikDuk-Provider must be owner, gemini or workers-ai');
}
