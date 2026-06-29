import { beforeEach, describe, it, expect, vi } from 'vitest';
import { computeCandidates, SpellController } from '../src/spellcheck/controller';

const storage = {
  get: vi.fn(async () => ({})),
};

const runtime = {
  sendMessage: vi.fn(async (msg: { type?: string }): Promise<any> => {
    if (msg.type === 'grammar-analyze') return { issues: [] };
    return { misspelled: ['שלוום'] };
  }),
};

beforeEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  storage.get.mockClear();
  runtime.sendMessage.mockClear();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local: storage },
    runtime,
  };
});

describe('computeCandidates', () => {
  it('returns tokens to check + unique normalized forms, applying skip + user dict + ignore', () => {
    const text = 'שלום שלוום שלוום צה״ל אני';
    const { tokens, norms } = computeCandidates(text, new Set(['שלום']), new Set(['אני']));
    // 'שלום' is in userdict, 'צה״ל' is an acronym (skipped), 'אני' is ignored.
    // Remaining candidates: the two 'שלוום' occurrences.
    expect(tokens.map((t) => t.text)).toEqual(['שלוום', 'שלוום']);
    // normalized forms are deduped for the worker
    expect(norms).toEqual(['שלוום']);
  });
});

describe('SpellController flag hit detection', () => {
  it('resolves an input click to the flagged token under the caret', async () => {
    vi.useFakeTimers();
    const controller = new SpellController();
    await controller.start();

    const input = document.createElement('input');
    input.value = 'שלום שלוום';
    document.body.appendChild(input);

    controller.rescan(input);
    await vi.advanceTimersByTimeAsync(500);

    input.setSelectionRange(7, 7);
    let hit = null as ReturnType<typeof controller.findFlagAtClick>;
    input.addEventListener('click', (e) => {
      hit = controller.findFlagAtClick(e as MouseEvent);
    });
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 34 }));

    expect(hit?.word).toBe('שלוום');
    expect(hit?.start).toBe(5);
    expect(hit?.end).toBe(10);
    expect(hit?.isTextField).toBe(true);
  });

  it('resolves a contenteditable click to a replaceable range', async () => {
    vi.useFakeTimers();
    const controller = new SpellController();
    await controller.start();

    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.textContent = 'שלום שלוום';
    document.body.appendChild(div);

    controller.rescan(div);
    await vi.advanceTimersByTimeAsync(500);

    const text = div.firstChild!;
    const range = document.createRange();
    range.setStart(text, 7);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    let hit = null as ReturnType<typeof controller.findFlagAtClick>;
    div.addEventListener('click', (e) => {
      hit = controller.findFlagAtClick(e as MouseEvent);
    });
    div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(hit?.word).toBe('שלוום');
    expect(hit?.range?.toString()).toBe('שלוום');
    expect(hit?.isTextField).toBe(false);
  });

  it('marks grammar issues returned for any textarea text', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockImplementation(async (msg: { type?: string }) => {
      if (msg.type === 'grammar-analyze') {
        return {
          issues: [{
            id: 'adjective_agreement',
            source: 'rule',
            severity: 'error',
            message: 'Adjective does not agree with the noun',
            start: 0,
            end: 9,
          }],
        };
      }
      return { misspelled: [] };
    });

    const controller = new SpellController();
    await controller.start();

    const textarea = document.createElement('textarea');
    textarea.value = 'הספר טובה';
    document.body.appendChild(textarea);

    controller.rescan(textarea);
    await vi.advanceTimersByTimeAsync(500);

    const mark = document.querySelector('.dikduk-grammar') as HTMLElement | null;
    expect(mark?.textContent).toBe('הספר טובה');
    expect(mark?.style.textDecorationColor).toBe('#c56a00');
  });

  it('resolves an input click to the grammar issue under the caret', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockImplementation(async (msg: { type?: string }): Promise<any> => {
      if (msg.type === 'grammar-analyze') {
        return {
          issues: [{
            id: 'subject_verb_agreement',
            source: 'rule',
            severity: 'error',
            message: 'Subject and verb do not agree',
            start: 4,
            end: 8,
            evidence: 'gender mismatch: היא is feminine, אומר is masculine',
          }],
        };
      }
      return { misspelled: [] };
    });

    const controller = new SpellController();
    await controller.start();

    const input = document.createElement('input');
    input.value = 'היא אומר';
    document.body.appendChild(input);

    controller.rescan(input);
    await vi.advanceTimersByTimeAsync(500);

    input.setSelectionRange(5, 5);
    let hit = null as ReturnType<typeof controller.findGrammarAtClick>;
    input.addEventListener('click', (e) => {
      hit = controller.findGrammarAtClick(e as MouseEvent);
    });
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 34 }));

    expect(hit?.issue.id).toBe('subject_verb_agreement');
    expect(hit?.issue.evidence).toBe('gender mismatch: היא is feminine, אומר is masculine');
    expect(hit?.isTextField).toBe(true);
  });

  it('suppresses grammar issues that overlap misspelled tokens', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockImplementation(async (msg: { type?: string }): Promise<any> => {
      if (msg.type === 'grammar-analyze') {
        return {
          issues: [{
            id: 'subject_verb_agreement',
            source: 'rule',
            severity: 'error',
            message: 'Subject and verb do not agree',
            start: 4,
            end: 8,
            evidence: 'gender mismatch: היא is feminine, אומת is masculine',
          }],
        };
      }
      return { misspelled: ['אומת'] };
    });

    const controller = new SpellController();
    await controller.start();

    const input = document.createElement('input');
    input.value = 'היא אומת';
    document.body.appendChild(input);

    controller.rescan(input);
    await vi.advanceTimersByTimeAsync(500);

    expect(document.querySelector('.dikduk-misspell')?.textContent).toBe('אומת');
    expect(document.querySelector('.dikduk-grammar')).toBeNull();

    input.setSelectionRange(5, 5);
    let grammarHit = null as ReturnType<typeof controller.findGrammarAtClick>;
    input.addEventListener('click', (e) => {
      grammarHit = controller.findGrammarAtClick(e as MouseEvent);
    });
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 34 }));
    expect(grammarHit).toBeNull();
  });
});
