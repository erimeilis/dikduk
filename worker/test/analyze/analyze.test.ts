import { describe, it, expect, vi } from 'vitest';
import {
  analyzeHebrew,
  deriveStructuralIssues,
  isAnalyzeError,
  normalizeDictaBertPayload,
  WORKERS_AI_GRAMMAR_MODELS,
} from '../../src/analyze';

const dictaPayload = {
  sentences: [
    {
      tokens: [
        {
          token: 'הילד',
          offsets: { start: 0, end: 4 },
          lex: 'ילד',
          morph: {
            pos: 'NOUN',
            feats: { Gender: 'Masc', Number: 'Sing' },
            prefixes: ['DET'],
            suffix: false,
          },
          seg: ['ה', 'ילד'],
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'הלכה',
          offsets: { start: 5, end: 9 },
          lex: 'הלך',
          morph: {
            pos: 'VERB',
            feats: { Gender: 'Fem', Number: 'Sing', Person: '3', Tense: 'Past' },
            prefixes: [],
            suffix: false,
          },
          seg: ['הלכה'],
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'הביתה',
          offsets: { start: 10, end: 16 },
          lex: 'בית',
          morph: {
            pos: 'ADV',
            feats: {},
            prefixes: [],
            suffix: false,
          },
          seg: ['הביתה'],
          syntax: { dep_head_idx: 1, dep_func: 'advmod' },
        },
      ],
    },
  ],
};

function amarLookupResult() {
  return {
    word: 'אמר',
    lemma: 'אמר',
    slug: 'amar',
    translation: 'say',
    root: 'אמר',
    isVerb: true,
    seeAlso: [],
    sourceUrl: 'https://www.pealim.com/',
    voices: {
      active: {
        binyan: 'paal',
        forms: {
          present: { ms: 'אומר', fs: 'אומרת', mp: 'אומרים', fp: 'אומרות' },
          past: {
            '1s': 'אמרתי',
            '1p': 'אמרנו',
            '2ms': 'אמרת',
            '2fs': 'אמרת',
            '2mp': 'אמרתם',
            '2fp': 'אמרתן',
            '3ms': 'אמר',
            '3fs': 'אָמְרָה',
            '3p': 'אמרו',
          },
          future: {
            '1s': 'אומר',
            '1p': 'נאמר',
            '2ms': 'תאמר',
            '2fs': 'תאמרי',
            '2mp': 'תאמרו',
            '2fp': 'תאמרנה',
            '3ms': 'יאמר',
            '3fs': 'תאמר',
            '3mp': 'יאמרו',
            '3fp': 'תאמרנה',
          },
          imperative: { '2ms': 'אמור', '2fs': 'אמרי', '2mp': 'אמרו', '2fp': 'אמרנה' },
          infinitive: 'לומר',
        },
      },
    },
  };
}

function lomedLookupResult() {
  return {
    word: 'לומד',
    lemma: 'למד',
    slug: 'lamad',
    translation: 'learn',
    root: 'למד',
    isVerb: true,
    seeAlso: [],
    sourceUrl: 'https://www.pealim.com/',
    voices: {
      active: {
        binyan: 'paal',
        forms: {
          present: { ms: 'לומד', fs: 'לומדת', mp: 'לומדים', fp: 'לומדות' },
          past: {
            '1s': 'למדתי',
            '1p': 'למדנו',
            '2ms': 'למדת',
            '2fs': 'למדת',
            '2mp': 'למדתם',
            '2fp': 'למדתן',
            '3ms': 'למד',
            '3fs': 'לָמְדָה',
            '3p': 'למדו',
          },
          future: {
            '1s': 'אלמד',
            '1p': 'נלמד',
            '2ms': 'תלמד',
            '2fs': 'תלמדי',
            '2mp': 'תלמדו',
            '2fp': 'תלמדנה',
            '3ms': 'ילמד',
            '3fs': 'תלמד',
            '3mp': 'ילמדו',
            '3fp': 'תלמדנה',
          },
          imperative: { '2ms': 'למד', '2fs': 'למדי', '2mp': 'למדו', '2fp': 'למדנה' },
          infinitive: 'ללמוד',
        },
      },
    },
  };
}

function chadashLookupResult() {
  return {
    word: 'חדש',
    lemma: 'חדש',
    slug: '2679-chadash',
    translation: 'new',
    root: 'ח־ד־ש',
    isVerb: false,
    adjectiveForms: {
      ms: 'חָדָשׁ',
      fs: 'חֲדָשָׁה',
      mp: 'חֲדָשִׁים',
      fp: 'חֲדָשׁוֹת',
    },
    seeAlso: [],
    sourceUrl: 'https://www.pealim.com/dict/2679-chadash/',
  };
}

describe('normalizeDictaBertPayload', () => {
  it('maps DictaBERT JSON into analyzer tokens with offsets and morphology', () => {
    const tokens = normalizeDictaBertPayload('הילד הלכה הביתה', dictaPayload);
    expect(tokens[0]).toMatchObject({
      surface: 'הילד',
      start: 0,
      end: 4,
      lemma: 'ילד',
      pos: 'NOUN',
      feats: { Gender: 'Masc', Number: 'Sing' },
      prefixes: ['DET'],
      segments: ['ה', 'ילד'],
      dependency: { head: 1, relation: 'nsubj' },
    });
    expect(tokens[1].start).toBe(5);
  });
});

describe('deriveStructuralIssues', () => {
  it('flags subject/verb agreement from morphology and dependency data', () => {
    const tokens = normalizeDictaBertPayload('הילד הלכה הביתה', dictaPayload);
    expect(deriveStructuralIssues(tokens)).toContainEqual(
      expect.objectContaining({
        id: 'subject_verb_agreement',
        start: 5,
        end: 9,
        source: 'rule',
      }),
    );
  });

  it('flags conjoined verbs that inherit the same subject', () => {
    const tokens = normalizeDictaBertPayload('היא אומרת ולמד', {
      tokens: [
        {
          token: 'היא',
          offsets: { start: 0, end: 3 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'אומרת',
          offsets: { start: 4, end: 9 },
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'ולמד',
          offsets: { start: 10, end: 14 },
          morph: { pos: 'VERB', feats: { Gender: 'Masc', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'conj' },
        },
      ],
    });

    expect(deriveStructuralIssues(tokens)).toContainEqual(
      expect.objectContaining({
        id: 'subject_verb_agreement',
        start: 10,
        end: 14,
      }),
    );
  });

  it('reports person before ambiguous gender in subject/verb agreement', () => {
    const tokens = normalizeDictaBertPayload('היא אמרת ולומדת', {
      tokens: [
        {
          token: 'היא',
          offsets: { start: 0, end: 3 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'אמרת',
          offsets: { start: 4, end: 8 },
          morph: { pos: 'VERB', feats: { Gender: 'Masc', Number: 'Sing', Person: '2' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'ולומדת',
          offsets: { start: 9, end: 15 },
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'conj' },
        },
      ],
    });

    expect(deriveStructuralIssues(tokens)).toContainEqual(
      expect.objectContaining({
        id: 'subject_verb_agreement',
        start: 4,
        end: 8,
        evidence: 'person mismatch: היא is third-person, אמרת is second-person',
        hint: 'Use a third-person feminine singular verb form to agree with היא.',
        suggestions: [
          'If אמרת is intended, use a second-person subject instead.',
        ],
      }),
    );
  });

  it('flags non-finite conjoined verb forms separately from gender agreement', () => {
    const tokens = normalizeDictaBertPayload('היא אומרת ולדבר', {
      tokens: [
        {
          token: 'היא',
          offsets: { start: 0, end: 3 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'אומרת',
          offsets: { start: 4, end: 9 },
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3', Tense: 'Pres' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'ולדבר',
          offsets: { start: 10, end: 15 },
          morph: { pos: 'VERB', feats: {} },
          syntax: { dep_head_idx: 1, dep_func: 'conj' },
        },
      ],
    });

    expect(deriveStructuralIssues(tokens)).toContainEqual(
      expect.objectContaining({
        id: 'verb_form_coordination',
        start: 10,
        end: 15,
      }),
    );
  });

  it('flags conjoined finite verbs with different tenses', () => {
    const tokens = normalizeDictaBertPayload('היא אמרה ולומדת', {
      tokens: [
        {
          token: 'היא',
          offsets: { start: 0, end: 3 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'אמרה',
          offsets: { start: 4, end: 8 },
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3', Tense: 'Past' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'ולומדת',
          offsets: { start: 9, end: 15 },
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3', Tense: 'Pres' } },
          syntax: { dep_head_idx: 1, dep_func: 'conj' },
        },
      ],
    });

    expect(deriveStructuralIssues(tokens)).toContainEqual(
      expect.objectContaining({
        id: 'verb_tense_coordination',
        start: 9,
        end: 15,
        evidence: 'tense mismatch: אמרה is past, ולומדת is present',
      }),
    );
  });

  it('flags conjoined verbs that are missing finite tense/person features', () => {
    const tokens = normalizeDictaBertPayload('היא אומרת ולמדת', {
      tokens: [
        {
          token: 'היא',
          offsets: { start: 0, end: 3 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'אומרת',
          offsets: { start: 4, end: 9 },
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3', Tense: 'Pres' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'ולמדת',
          offsets: { start: 10, end: 15 },
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing' } },
          syntax: { dep_head_idx: 1, dep_func: 'conj' },
        },
      ],
    });

    expect(deriveStructuralIssues(tokens)).toContainEqual(
      expect.objectContaining({
        id: 'verb_form_coordination',
        start: 10,
        end: 15,
        evidence: 'verb form mismatch: אומרת is present third-person feminine singular, ולמדת is missing person and tense',
      }),
    );
  });

  it('flags adjective agreement without a local noun dictionary', () => {
    const tokens = normalizeDictaBertPayload('הספר טובה', {
      tokens: [
        {
          token: 'הספר',
          morph: { pos: 'NOUN', feats: { Gender: 'Masc', Number: 'Sing' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'טובה',
          morph: { pos: 'ADJ', feats: { Gender: 'Fem', Number: 'Sing' } },
          syntax: { dep_head_idx: 0, dep_func: 'amod' },
        },
      ],
    });

    expect(deriveStructuralIssues(tokens)).toContainEqual(
      expect.objectContaining({ id: 'adjective_agreement' }),
    );
  });

  it('does not flag agreement when analyzer features agree', () => {
    const tokens = normalizeDictaBertPayload('הספר טוב', {
      tokens: [
        {
          token: 'הספר',
          morph: { pos: 'NOUN', feats: { Gender: 'Masc', Number: 'Sing' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'טוב',
          morph: { pos: 'ADJ', feats: { Gender: 'Masc', Number: 'Sing' } },
          syntax: { dep_head_idx: 0, dep_func: 'amod' },
        },
      ],
    });

    expect(deriveStructuralIssues(tokens).map((issue) => issue.id)).not.toContain('adjective_agreement');
  });

  it('flags repeated words from token stream', () => {
    const tokens = normalizeDictaBertPayload('אני אני הולך', {
      tokens: [
        { token: 'אני', morph: { pos: 'PRON', feats: {} } },
        { token: 'אני', morph: { pos: 'PRON', feats: {} } },
        { token: 'הולך', morph: { pos: 'VERB', feats: {} } },
      ],
    });

    expect(deriveStructuralIssues(tokens)).toContainEqual(
      expect.objectContaining({ id: 'repeated_word', start: 4, end: 7 }),
    );
  });
});

describe('analyzeHebrew', () => {
  it('uses the configured DictaBERT HTTP provider', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(dictaPayload), { status: 200 })) as any;
    const result = await analyzeHebrew(
      { text: 'הילד הלכה הביתה' },
      { env: { DICTABERT_ANALYZER_URL: 'https://dicta.example/analyze' }, fetchImpl },
    );

    expect(isAnalyzeError(result)).toBe(false);
    if (isAnalyzeError(result)) return;
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dicta.example/analyze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'הילד הלכה הביתה', output_style: 'json' }),
      }),
    );
    expect(result.provider).toBe('dictabert-http');
    expect(result.issues.map((issue) => issue.id)).toContain('subject_verb_agreement');
  });

  it('enriches subject/verb issues with past and present Hebrew replacements when tense is contextual only', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      tokens: [
        {
          token: 'היא',
          offsets: { start: 0, end: 3 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'אמרת',
          offsets: { start: 4, end: 8 },
          lex: 'אמר',
          morph: { pos: 'VERB', feats: { Gender: 'Masc', Number: 'Sing', Person: '2', Tense: 'Past' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
      ],
    }), { status: 200 })) as any;
    const lookupImpl = vi.fn(async () => amarLookupResult()) as any;

    const result = await analyzeHebrew(
      { text: 'היא אמרת' },
      { env: { DICTABERT_ANALYZER_URL: 'https://dicta.example/analyze' }, fetchImpl, lookupImpl },
    );

    expect(isAnalyzeError(result)).toBe(false);
    if (isAnalyzeError(result)) return;
    expect(lookupImpl).toHaveBeenCalledWith('אמר');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        id: 'subject_verb_agreement',
        replacement: 'אמרה',
        replacements: [
          { value: 'אמרה', label: 'Past' },
          { value: 'אומרת', label: 'Present' },
        ],
      }),
    );
  });

  it('uses explicit temporal context to narrow Hebrew replacements', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      tokens: [
        {
          token: 'מחר',
          offsets: { start: 0, end: 3 },
          lex: 'מחר',
          morph: { pos: 'ADV', feats: {} },
          syntax: { dep_head_idx: 2, dep_func: 'advmod' },
        },
        {
          token: 'היא',
          offsets: { start: 4, end: 7 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 2, dep_func: 'nsubj' },
        },
        {
          token: 'אמרת',
          offsets: { start: 8, end: 12 },
          lex: 'אמר',
          morph: { pos: 'VERB', feats: { Gender: 'Masc', Number: 'Sing', Person: '2', Tense: 'Past' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
      ],
    }), { status: 200 })) as any;
    const lookupImpl = vi.fn(async () => amarLookupResult()) as any;

    const result = await analyzeHebrew(
      { text: 'מחר היא אמרת' },
      { env: { DICTABERT_ANALYZER_URL: 'https://dicta.example/analyze' }, fetchImpl, lookupImpl },
    );

    expect(isAnalyzeError(result)).toBe(false);
    if (isAnalyzeError(result)) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        id: 'subject_verb_agreement',
        replacement: 'תאמר',
        replacements: [{ value: 'תאמר', label: 'Future' }],
      }),
    );
  });

  it('enriches tense coordination issues with a Hebrew replacement for the conjoined verb', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      tokens: [
        {
          token: 'היא',
          offsets: { start: 0, end: 3 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'אמרה',
          offsets: { start: 4, end: 8 },
          lex: 'אמר',
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3', Tense: 'Past' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'ולומדת',
          offsets: { start: 9, end: 15 },
          lex: 'לומד',
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3', Tense: 'Pres' }, prefixes: ['CCONJ'] },
          seg: ['ו', 'לומדת'],
          syntax: { dep_head_idx: 1, dep_func: 'conj' },
        },
      ],
    }), { status: 200 })) as any;
    const lookupImpl = vi.fn(async (query: string) =>
      query === 'לומד' ? lomedLookupResult() : amarLookupResult()) as any;

    const result = await analyzeHebrew(
      { text: 'היא אמרה ולומדת' },
      { env: { DICTABERT_ANALYZER_URL: 'https://dicta.example/analyze' }, fetchImpl, lookupImpl },
    );

    expect(isAnalyzeError(result)).toBe(false);
    if (isAnalyzeError(result)) return;
    expect(lookupImpl).toHaveBeenCalledWith('לומד');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        id: 'verb_tense_coordination',
        replacement: 'ולמדה',
        replacements: [{ value: 'ולמדה', label: 'Past' }],
      }),
    );
  });

  it('enriches incomplete finite conjoined verbs with a matching Hebrew replacement', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      tokens: [
        {
          token: 'היא',
          offsets: { start: 0, end: 3 },
          morph: { pos: 'PRON', feats: { Gender: 'Fem', Number: 'Sing', Person: '3' } },
          syntax: { dep_head_idx: 1, dep_func: 'nsubj' },
        },
        {
          token: 'אומרת',
          offsets: { start: 4, end: 9 },
          lex: 'אומר',
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing', Person: '3', Tense: 'Pres' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'ולמדת',
          offsets: { start: 10, end: 15 },
          lex: 'לומד',
          morph: { pos: 'VERB', feats: { Gender: 'Fem', Number: 'Sing' }, prefixes: ['CCONJ'] },
          seg: ['ו', 'למדת'],
          syntax: { dep_head_idx: 1, dep_func: 'conj' },
        },
      ],
    }), { status: 200 })) as any;
    const lookupImpl = vi.fn(async (query: string) =>
      query === 'לומד' ? lomedLookupResult() : amarLookupResult()) as any;

    const result = await analyzeHebrew(
      { text: 'היא אומרת ולמדת' },
      { env: { DICTABERT_ANALYZER_URL: 'https://dicta.example/analyze' }, fetchImpl, lookupImpl },
    );

    expect(isAnalyzeError(result)).toBe(false);
    if (isAnalyzeError(result)) return;
    expect(lookupImpl).toHaveBeenCalledWith('לומד');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        id: 'verb_form_coordination',
        replacement: 'ולומדת',
        replacements: [{ value: 'ולומדת', label: 'Present' }],
      }),
    );
  });

  it('enriches adjective agreement issues with a Hebrew adjective form', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      tokens: [
        {
          token: 'עלים',
          offsets: { start: 0, end: 4 },
          lex: 'עלה',
          morph: { pos: 'NOUN', feats: { Gender: 'Masc', Number: 'Plur' } },
          syntax: { dep_head_idx: -1, dep_func: 'root' },
        },
        {
          token: 'חדש',
          offsets: { start: 5, end: 8 },
          lex: 'חדש',
          morph: { pos: 'ADJ', feats: { Gender: 'Masc', Number: 'Sing' } },
          syntax: { dep_head_idx: 0, dep_func: 'amod' },
        },
      ],
    }), { status: 200 })) as any;
    const lookupImpl = vi.fn(async () => chadashLookupResult()) as any;

    const result = await analyzeHebrew(
      { text: 'עלים חדש' },
      { env: { DICTABERT_ANALYZER_URL: 'https://dicta.example/analyze' }, fetchImpl, lookupImpl },
    );

    expect(isAnalyzeError(result)).toBe(false);
    if (isAnalyzeError(result)) return;
    expect(lookupImpl).toHaveBeenCalledWith('חדש');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        id: 'adjective_agreement',
        replacement: 'חדשים',
        replacements: [{ value: 'חדשים', label: 'masculine plural' }],
      }),
    );
  });

  it('requires an explicit provider configuration', async () => {
    const result = await analyzeHebrew({ text: 'שלום' });
    expect(result).toEqual({ error: 'No analysis provider configured', code: 'NO_PROVIDER' });
  });

  it('rejects malformed requests cleanly', async () => {
    const result = await analyzeHebrew(null);
    expect(result).toEqual({ error: 'Missing text', code: 'BAD_REQUEST' });
  });

  it('documents the Cloudflare LLM fallback models', () => {
    expect(WORKERS_AI_GRAMMAR_MODELS).toEqual([
      '@cf/google/gemma-3-12b-it',
      '@cf/moonshotai/kimi-k2.6',
    ]);
  });
});
