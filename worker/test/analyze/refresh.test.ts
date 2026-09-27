import { describe, it, expect, vi } from 'vitest';
import { refreshModels, REFRESH_CONTROL_TEXT } from '../../src/analyze/refresh';

const PRICING = `| Model | x | y |
| @cf/cheap/deprecated | $0.01 per M input tokens  $0.02 per M output tokens | n |
| @cf/cheap/embedding | $0.02 per M input tokens  $0.03 per M output tokens | n |
| @cf/good/a | $0.03 per M input tokens  $0.04 per M output tokens | n |
| @cf/good/b | $0.05 per M input tokens  $0.06 per M output tokens | n |
| @cf/good/c | $0.07 per M input tokens  $0.08 per M output tokens | n |`;

const isControl = (input: any) => input.messages[1].content.includes(REFRESH_CONTROL_TEXT);

function fakeKv() { const s = new Map<string,string>(); return { async get(k:string, _t:'json'){const v=s.get(k);return v?JSON.parse(v):null;}, async put(k:string,v:string){s.set(k,v);}, _s: s }; }

describe('refreshModels', () => {
  it('keeps the cheapest working models, skipping models that error, return no text, or miss the probe error', async () => {
    const found = JSON.stringify({ issues: [{ id: 'subject_verb_agreement', severity: 'error', message: 'Verb must be feminine', start: 6, end: 9 }] });
    const ai = { run: vi.fn(async (id: string, input: any) => {
      if (id === '@cf/cheap/deprecated') throw new Error('5018: not allowed');
      if (id === '@cf/cheap/embedding') return { data: [[0.1, 0.2]] };        // no text
      return { choices: [{ message: { content: isControl(input) ? '{"issues":[]}' : found } }] };
    }) };
    const kv = fakeKv();
    const fetchImpl = (async () => new Response(PRICING, { status: 200 })) as unknown as typeof fetch;

    const result = await refreshModels({ ai: ai as any, kv, fetchImpl, limit: 2 });
    expect(result.map((m) => m.id)).toEqual(['@cf/good/a', '@cf/good/b']);
    expect(await kv.get('analyze:models:v1', 'json')).toHaveLength(2);
  });

  it('logs each model it skips', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const found = JSON.stringify({ issues: [{ id: 'subject_verb_agreement', severity: 'error', message: 'Verb must be feminine', start: 6, end: 9 }] });
    const ai = { run: vi.fn(async (id: string, input: any) => {
      if (id === '@cf/cheap/deprecated') throw new Error('5018: not allowed');
      return { choices: [{ message: { content: isControl(input) ? '{"issues":[]}' : found } }] };
    }) };
    const fetchImpl = (async () => new Response(PRICING, { status: 200 })) as unknown as typeof fetch;
    await refreshModels({ ai: ai as any, kv: fakeKv(), fetchImpl, limit: 1 });
    expect(JSON.stringify(warn.mock.calls)).toContain('@cf/cheap/deprecated');
    warn.mockRestore();
  });

  it('keeps the previous list when nothing works, instead of writing an empty one', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const kv = fakeKv();
    await kv.put('analyze:models:v1', JSON.stringify([{ id: '@cf/good/a', inUsdPerM: 1, outUsdPerM: 1 }]));
    const fetchImpl = (async () => new Response('page format changed', { status: 200 })) as unknown as typeof fetch;
    const result = await refreshModels({ ai: { run: vi.fn() } as any, kv, fetchImpl });
    expect(result).toEqual([]);
    expect(await kv.get('analyze:models:v1', 'json')).toEqual([{ id: '@cf/good/a', inUsdPerM: 1, outUsdPerM: 1 }]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('rejects a model that answers with the template placeholder instead of the real error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const echo = JSON.stringify({ issues: [{ id: 'short_snake_case', severity: 'error', message: 'English explanation', start: 6, end: 9 }] });
    const good = JSON.stringify({ issues: [{ id: 'subject_verb_agreement', severity: 'error', message: 'Verb must be feminine', start: 6, end: 9 }] });
    const ai = { run: vi.fn(async (id: string, input: any) => ({ choices: [{ message: { content: isControl(input) ? '{"issues":[]}' : id === '@cf/good/a' ? echo : good } }] })) };
    const fetchImpl = (async () => new Response(PRICING, { status: 200 })) as unknown as typeof fetch;
    const result = await refreshModels({ ai: ai as any, kv: fakeKv(), fetchImpl, limit: 10 });
    expect(result.map((m) => m.id)).not.toContain('@cf/good/a');
    expect(result.map((m) => m.id)).toContain('@cf/good/b');
    warn.mockRestore();
  });

  it('rejects a model that also flags a correct sentence (it flags everything)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const found = JSON.stringify({ issues: [{ id: 'subject_verb_agreement', severity: 'error', message: 'Verb must be feminine', start: 6, end: 9 }] });
    const noisy = JSON.stringify({ issues: [{ id: 'gender_agreement', severity: 'error', message: 'Wrong', start: 0, end: 3 }] });
    const clean = JSON.stringify({ issues: [] });
    const ai = { run: vi.fn(async (id: string, input: any) => {
      const isControl = input.messages[1].content.includes(REFRESH_CONTROL_TEXT);
      if (id === '@cf/good/a') return { choices: [{ message: { content: isControl ? noisy : found } }] };
      return { choices: [{ message: { content: isControl ? clean : found } }] };
    }) };
    const fetchImpl = (async () => new Response(PRICING, { status: 200 })) as unknown as typeof fetch;
    const result = await refreshModels({ ai: ai as any, kv: fakeKv(), fetchImpl, limit: 10 });
    expect(result.map((m) => m.id)).not.toContain('@cf/good/a');
    expect(result.map((m) => m.id)).toContain('@cf/good/b');
    warn.mockRestore();
  });
});
