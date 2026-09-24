import { describe, it, expect, vi } from 'vitest';
import { WorkersAiAnalyzer } from '../../src/analyze/providers/workers-ai';
import type { CatalogueModel } from '../../src/analyze/catalogue';

const models: CatalogueModel[] = [
  { id: '@cf/a/first', inUsdPerM: 0.1, outUsdPerM: 0.2 },
  { id: '@cf/b/second', inUsdPerM: 0.3, outUsdPerM: 0.4 },
];

describe('WorkersAiAnalyzer', () => {
  it('falls through to the next model on error', async () => {
    const ai = {
      run: vi.fn(async (id: string) => {
        if (id === '@cf/a/first') throw new Error('5018');
        return {
          choices: [{ message: { content: '{"issues":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        };
      }),
    };
    const a = new WorkersAiAnalyzer(ai as any, models);
    const r = await a.analyze('היא אומר');
    expect('error' in r).toBe(false);
    expect((r as any).model).toBe('@cf/b/second');
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('parses issues from the winning model response', async () => {
    const ai = {
      run: vi.fn(async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                issues: [
                  { id: 'gender_agreement', severity: 'error', message: 'mismatch', start: 0, end: 3 },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      })),
    };
    const a = new WorkersAiAnalyzer(ai as any, [models[0]]);
    const r = await a.analyze('היא אומר');
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.model).toBe('@cf/a/first');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ id: 'gender_agreement' });
    expect((r.raw as any).usage).toEqual({ prompt_tokens: 20, completion_tokens: 8 });
  });

  it('returns an UPSTREAM error when every model fails', async () => {
    const ai = {
      run: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const a = new WorkersAiAnalyzer(ai as any, models);
    const r = await a.analyze('היא אומר');
    expect(r).toEqual({ error: 'Workers AI analysis failed: boom', code: 'UPSTREAM' });
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('returns an UPSTREAM error when given an empty model list', async () => {
    const ai = { run: vi.fn() };
    const a = new WorkersAiAnalyzer(ai as any, []);
    const r = await a.analyze('היא אומר');
    expect('error' in r).toBe(true);
    expect((r as any).code).toBe('UPSTREAM');
    expect(ai.run).not.toHaveBeenCalled();
  });
});
