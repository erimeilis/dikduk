import { describe, it, expect, vi } from 'vitest';
import { refreshModels } from '../../src/analyze/refresh';

const PRICING = `| Model | x | y |
| @cf/cheap/deprecated | $0.01 per M input tokens  $0.02 per M output tokens | n |
| @cf/cheap/embedding | $0.02 per M input tokens  $0.03 per M output tokens | n |
| @cf/good/a | $0.03 per M input tokens  $0.04 per M output tokens | n |
| @cf/good/b | $0.05 per M input tokens  $0.06 per M output tokens | n |
| @cf/good/c | $0.07 per M input tokens  $0.08 per M output tokens | n |`;

function fakeKv() { const s = new Map<string,string>(); return { async get(k:string, _t:'json'){const v=s.get(k);return v?JSON.parse(v):null;}, async put(k:string,v:string){s.set(k,v);}, _s: s }; }

describe('refreshModels', () => {
  it('keeps the cheapest working models, skipping models that error or return no text', async () => {
    const ai = { run: vi.fn(async (id: string) => {
      if (id === '@cf/cheap/deprecated') throw new Error('5018: not allowed');
      if (id === '@cf/cheap/embedding') return { data: [[0.1, 0.2]] };        // no text
      return { choices: [{ message: { content: '{"issues":[]}' } }] };
    }) };
    const kv = fakeKv();
    const fetchImpl = (async () => new Response(PRICING, { status: 200 })) as unknown as typeof fetch;

    const result = await refreshModels({ ai: ai as any, kv, fetchImpl, limit: 2 });
    expect(result.map((m) => m.id)).toEqual(['@cf/good/a', '@cf/good/b']);
    expect(await kv.get('analyze:models:v1', 'json')).toHaveLength(2);
  });
});
