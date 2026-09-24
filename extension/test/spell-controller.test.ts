import { beforeEach, describe, it, expect, vi } from 'vitest';
import { computeCandidates, SpellController } from '../src/spellcheck/controller';
import { SpellTransport } from '../src/spellcheck/transport';

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

describe('SpellController spell/grammar decoupling + persistence', () => {
  it('renders spell flags immediately without waiting for the slower grammar call', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockImplementation((msg: { type?: string }): Promise<any> => {
      if (msg.type === 'grammar-analyze') {
        // Grammar is a slow network round-trip; resolve it well after spell.
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                issues: [{
                  id: 'x_agreement',
                  source: 'rule',
                  severity: 'error',
                  message: 'm',
                  start: 0,
                  end: 4,
                }],
              }),
            2000,
          ),
        );
      }
      return Promise.resolve({ misspelled: ['שלוום'] });
    });

    const controller = new SpellController();
    await controller.start();

    const input = document.createElement('input');
    input.value = 'שלום שלוום';
    document.body.appendChild(input);

    controller.rescan(input);
    // Debounce fires; the fast spell check resolves; grammar is still pending.
    await vi.advanceTimersByTimeAsync(500);

    // Spell underline must be visible even though grammar has not resolved.
    expect(document.querySelector('.dikduk-misspell')?.textContent).toBe('שלוום');
    expect(document.querySelector('.dikduk-grammar')).toBeNull();

    // Once grammar resolves, its underline appears without disturbing the spell one.
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.dikduk-grammar')?.textContent).toBe('שלום');
    expect(document.querySelector('.dikduk-misspell')?.textContent).toBe('שלוום');
  });

  it('keeps flags visible after the field loses focus', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockImplementation(async (msg: { type?: string }): Promise<any> => {
      if (msg.type === 'grammar-analyze') return { issues: [] };
      return { misspelled: ['שלוום'] };
    });

    const controller = new SpellController();
    await controller.start();

    const input = document.createElement('input');
    input.value = 'שלום שלוום';
    document.body.appendChild(input);

    controller.rescan(input);
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelector('.dikduk-misspell')?.textContent).toBe('שלוום');

    // Blurring the field must NOT wipe the flags — the user needs to still see them.
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(document.querySelector('.dikduk-misspell')?.textContent).toBe('שלוום');
  });

  it('keeps grammar flags visible while re-scanning unchanged text', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockImplementation((msg: { type?: string }): Promise<any> => {
      if (msg.type === 'grammar-analyze') {
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                issues: [{
                  id: 'x_agreement',
                  source: 'rule',
                  severity: 'error',
                  message: 'm',
                  start: 0,
                  end: 4,
                }],
              }),
            2000,
          ),
        );
      }
      return Promise.resolve({ misspelled: [] });
    });

    const controller = new SpellController();
    await controller.start();

    const input = document.createElement('input');
    input.value = 'שלום עולם';
    document.body.appendChild(input);

    controller.rescan(input);
    await vi.advanceTimersByTimeAsync(2500);
    expect(document.querySelector('.dikduk-grammar')?.textContent).toBe('שלום');

    // Refocus-style rescan of the same text: spell repaints fast, grammar is
    // still in flight — the previous grammar underline must not disappear.
    controller.rescan(input);
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelector('.dikduk-grammar')?.textContent).toBe('שלום');
  });

  it('ignores a late spell reply from an older scan of the same text', async () => {
    vi.useFakeTimers();
    let spellCalls = 0;
    runtime.sendMessage.mockImplementation((msg: { type?: string }): Promise<any> => {
      if (msg.type === 'grammar-analyze') return Promise.resolve({ issues: [] });
      spellCalls += 1;
      // First scan's reply is slow and flags the word; the rescan's is fast and clean.
      return spellCalls === 1
        ? new Promise((resolve) => setTimeout(() => resolve({ misspelled: ['שלוום'] }), 2000))
        : Promise.resolve({ misspelled: [] });
    });

    const controller = new SpellController();
    await controller.start();

    const input = document.createElement('input');
    input.value = 'שלום שלוום';
    document.body.appendChild(input);

    controller.rescan(input);
    await vi.advanceTimersByTimeAsync(500);
    // Same text rescanned (as after Ignore / Add to dictionary).
    controller.rescan(input);
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('.dikduk-misspell')).toBeNull();
  });

  it('names the contenteditable host in each flags event so fields stay separate', async () => {
    vi.useFakeTimers();
    const details: Array<{ fieldId: string; offsets: unknown[] }> = [];
    const listener = (e: Event) => details.push((e as CustomEvent).detail);
    window.addEventListener('dikduk-spell-flags', listener);

    const controller = new SpellController();
    await controller.start();

    const a = document.createElement('div');
    a.setAttribute('contenteditable', 'true');
    a.textContent = 'שלום שלוום';
    const b = document.createElement('div');
    b.setAttribute('contenteditable', 'true');
    b.textContent = 'שלום שלוום';
    document.body.append(a, b);

    controller.rescan(a);
    await vi.advanceTimersByTimeAsync(500);
    controller.rescan(b);
    await vi.advanceTimersByTimeAsync(500);
    window.removeEventListener('dikduk-spell-flags', listener);

    const idA = a.getAttribute('data-dikduk-field');
    const idB = b.getAttribute('data-dikduk-field');
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
    expect(details.map((d) => d.fieldId)).toEqual(expect.arrayContaining([idA, idB]));
  });
});

describe('SpellTransport.analyzeGrammar error surfacing', () => {
  it('surfaces a worker error instead of silently returning empty issues', async () => {
    const messenger = {
      sendMessage: vi.fn(async (msg: { type?: string }) => {
        if (msg.type === 'grammar-analyze') {
          return { error: 'No grammar models available', code: 'NO_MODELS' };
        }
        return { misspelled: [] };
      }),
    };
    const transport = new SpellTransport(messenger);

    const result = await transport.analyzeGrammar('הספר טובה');

    expect(result).toEqual({ issues: [], error: 'No grammar models available', code: 'NO_MODELS' });
  });

  it('swallows genuine network exceptions into an error result instead of throwing', async () => {
    const messenger = {
      sendMessage: vi.fn(async () => {
        throw new Error('network down');
      }),
    };
    const transport = new SpellTransport(messenger);

    const result = await transport.analyzeGrammar('הספר טובה');

    expect(result).toEqual({ issues: [], error: 'network down' });
  });
});

describe('SpellController grammar-status surfacing', () => {
  it('dispatches a dikduk-grammar-status event when grammar analysis errors and no flags are found', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockImplementation(async (msg: { type?: string }): Promise<any> => {
      if (msg.type === 'grammar-analyze') {
        return { error: 'No grammar models available', code: 'NO_MODELS' };
      }
      return { misspelled: [] };
    });

    const events: { message: string }[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('dikduk-grammar-status', listener);

    const controller = new SpellController();
    await controller.start();

    const textarea = document.createElement('textarea');
    textarea.value = 'הספר טובה';
    document.body.appendChild(textarea);

    controller.rescan(textarea);
    await vi.advanceTimersByTimeAsync(500);

    window.removeEventListener('dikduk-grammar-status', listener);

    expect(events).toEqual([{ message: 'No grammar models available' }]);
    expect(document.querySelector('.dikduk-grammar')).toBeNull();
  });

  it('uses friendlier copy for a BUDGET error code', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockImplementation(async (msg: { type?: string }): Promise<any> => {
      if (msg.type === 'grammar-analyze') {
        return { error: 'Monthly grammar budget reached', code: 'BUDGET' };
      }
      return { misspelled: [] };
    });

    const events: { message: string }[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('dikduk-grammar-status', listener);

    const controller = new SpellController();
    await controller.start();

    const textarea = document.createElement('textarea');
    textarea.value = 'הספר טובה';
    document.body.appendChild(textarea);

    controller.rescan(textarea);
    await vi.advanceTimersByTimeAsync(500);

    window.removeEventListener('dikduk-grammar-status', listener);

    expect(events).toEqual([{ message: 'Grammar paused — monthly limit reached' }]);
  });
});
