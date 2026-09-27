import { describe, it, expect, vi } from 'vitest';
import { restRunner, BadKeyError } from '../../src/auth/ai-runner';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('restRunner', () => {
  it('posts to the account AI endpoint with the user token and returns result', async () => {
    const fetchImpl = vi.fn(async () => json(200, { success: true, result: { response: 'Settings' }, errors: [] }));
    const out = await restRunner('acc1', 'tok', fetchImpl as any).run('@cf/meta/model', { messages: [] });
    expect(out).toEqual({ response: 'Settings' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc1/ai/run/@cf/meta/model');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('maps 401/403 to BadKeyError', async () => {
    for (const status of [401, 403]) {
      const run = restRunner('a', 't', (async () => json(status, { success: false, errors: [] })) as any);
      await expect(run.run('m', {})).rejects.toBeInstanceOf(BadKeyError);
    }
  });

  it('does not call a paid-plan-only model (403 + 5035) a bad key', async () => {
    const run = restRunner('a', 't', (async () =>
      json(403, { success: false, errors: [{ code: 5035, message: 'This model requires the Workers Paid plan' }] })) as any);
    const err = await run.run('m', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BadKeyError);
  });

  it('restRunner maps CF auth error 10000 to BadKeyError', async () => {
    const run = restRunner('a', 't', (async () =>
      json(400, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] })) as any);
    await expect(run.run('m', {})).rejects.toBeInstanceOf(BadKeyError);
  });

  it('throws a plain error for other failures, without the token in the message', async () => {
    const run = restRunner('a', 'secret-token', (async () => json(500, { success: false, errors: [{ code: 7000, message: 'boom' }] })) as any);
    const err = (await run.run('m', {}).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BadKeyError);
    expect(String(err.message)).not.toContain('secret-token');
  });

  it('never logs the token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = restRunner('a', 'secret-token', (async () => json(500, { success: false, errors: [{ code: 7000, message: 'boom' }] })) as any);
    await run.run('m', {}).catch(() => {});
    const bad = restRunner('a', 'secret-token', (async () => json(401, { success: false })) as any);
    await bad.run('m', {}).catch(() => {});
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-token');
    spy.mockRestore();
  });
});
