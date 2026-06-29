import type { AdjectiveForms, Conjugation, LookupError, LookupResult } from './types';

export type AnalysisProvider = 'dictabert-http' | 'workers-ai' | 'gemini';
export type AnalysisSeverity = 'info' | 'warning' | 'error';
export type IssueSource = 'rule' | 'llm';

export interface AnalyzeRequest {
  text: string;
  provider?: AnalysisProvider;
  model?: string;
}

export interface AnalysisToken {
  index: number;
  surface: string;
  start: number;
  end: number;
  lemma?: string;
  pos?: string;
  feats: Record<string, string>;
  prefixes: string[];
  suffix?: string;
  segments: string[];
  dependency?: {
    head: number;
    relation: string;
  };
}

export interface GrammarIssue {
  id: string;
  source: IssueSource;
  severity: AnalysisSeverity;
  message: string;
  start: number;
  end: number;
  replacement?: string;
  replacements?: GrammarReplacement[];
  evidence?: string;
  hint?: string;
  suggestions?: string[];
}

export interface GrammarReplacement {
  value: string;
  label?: string;
}

export interface AnalyzeResult {
  provider: AnalysisProvider;
  model?: string;
  text: string;
  tokens: AnalysisToken[];
  issues: GrammarIssue[];
  raw?: unknown;
}

export type AnalyzeErrorCode = 'BAD_REQUEST' | 'NO_PROVIDER' | 'UPSTREAM' | 'PARSE';

export interface AnalyzeError {
  error: string;
  code: AnalyzeErrorCode;
}

export interface AnalyzeEnv {
  DICTABERT_ANALYZER_URL?: string;
  DICTABERT_ANALYZER_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  AI?: Ai;
}

export interface AnalyzeDeps {
  env?: AnalyzeEnv;
  fetchImpl?: typeof fetch;
  lookupImpl?: MorphologyLookup;
}

type MorphologyLookup = (query: string) => Promise<LookupResult | LookupError>;

interface Analyzer {
  provider: AnalysisProvider;
  analyze(text: string, request: AnalyzeRequest): Promise<AnalyzeResult | AnalyzeError>;
}

type DictaBertToken = {
  token?: unknown;
  offsets?: {
    start?: unknown;
    end?: unknown;
  };
  lex?: unknown;
  seg?: unknown;
  morph?: {
    pos?: unknown;
    feats?: unknown;
    prefixes?: unknown;
    suffix?: unknown;
  };
  syntax?: {
    dep_head_idx?: unknown;
    dep_func?: unknown;
  };
};

export const WORKERS_AI_GRAMMAR_MODELS = [
  '@cf/google/gemma-3-12b-it',
  '@cf/moonshotai/kimi-k2.6',
] as const;

const DEFAULT_WORKERS_AI_MODEL = WORKERS_AI_GRAMMAR_MODELS[0];
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const MAX_TEXT_LENGTH = 2000;
const TENSE_LABELS: Record<VerbTense, string> = {
  past: 'Past',
  present: 'Present',
  future: 'Future',
};
const TEMPORAL_TENSE_MARKERS: Record<string, VerbTense> = {
  'אתמול': 'past',
  'אמש': 'past',
  'שלשום': 'past',
  'עכשיו': 'present',
  'כרגע': 'present',
  'היום': 'present',
  'מחר': 'future',
  'מחרתיים': 'future',
};
const TEMPORAL_UNIT_LEMMAS = new Set(['יום', 'שבוע', 'חודש', 'שנה']);
const PAST_CONTEXT_WORDS = new Set(['עבר', 'שעבר', 'שעברה', 'אחרון', 'אחרונה', 'קודם', 'קודמת']);
const FUTURE_CONTEXT_WORDS = new Set(['בא', 'באה', 'הבא', 'הבאה', 'קרוב', 'קרובה']);

type VerbTense = 'past' | 'present' | 'future';

export function isAnalyzeError(result: AnalyzeResult | AnalyzeError): result is AnalyzeError {
  return (result as AnalyzeError).code !== undefined;
}

export async function analyzeHebrew(
  request: unknown,
  deps: AnalyzeDeps = {},
): Promise<AnalyzeResult | AnalyzeError> {
  const input = request && typeof request === 'object' ? request as Partial<AnalyzeRequest> : {};
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) return { error: 'Missing text', code: 'BAD_REQUEST' };
  if (text.length > MAX_TEXT_LENGTH) {
    return { error: `Text is too long; max ${MAX_TEXT_LENGTH} characters`, code: 'BAD_REQUEST' };
  }

  const provider = isAnalysisProvider(input.provider) ? input.provider : undefined;
  const analyzer = createAnalyzer(provider, deps);
  if (!analyzer) {
    return {
      error: 'No analysis provider configured',
      code: 'NO_PROVIDER',
    };
  }

  return analyzer.analyze(text, {
    text,
    provider,
    model: typeof input.model === 'string' ? input.model : undefined,
  });
}

function isAnalysisProvider(provider: unknown): provider is AnalysisProvider {
  return provider === 'dictabert-http' || provider === 'workers-ai' || provider === 'gemini';
}

function createAnalyzer(provider: AnalysisProvider | undefined, deps: AnalyzeDeps): Analyzer | null {
  const env = deps.env ?? {};
  const fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));

  if (provider === 'dictabert-http' || (!provider && env.DICTABERT_ANALYZER_URL)) {
    if (!env.DICTABERT_ANALYZER_URL) return null;
    return new DictaBertHttpAnalyzer(
      env.DICTABERT_ANALYZER_URL,
      env.DICTABERT_ANALYZER_TOKEN,
      fetchImpl,
      deps.lookupImpl,
    );
  }

  if (provider === 'workers-ai') {
    return env.AI ? new WorkersAiAnalyzer(env.AI) : null;
  }

  if (provider === 'gemini') {
    return env.GEMINI_API_KEY ? new GeminiAnalyzer(env.GEMINI_API_KEY, env.GEMINI_MODEL, fetchImpl) : null;
  }

  return null;
}

class DictaBertHttpAnalyzer implements Analyzer {
  provider: AnalysisProvider = 'dictabert-http';

  constructor(
    private readonly endpoint: string,
    private readonly token: string | undefined,
    private readonly fetchImpl: typeof fetch,
    private readonly lookupImpl: MorphologyLookup | undefined,
  ) {}

  async analyze(text: string): Promise<AnalyzeResult | AnalyzeError> {
    let response: Response;
    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': 'application/json',
      };
      if (this.token) headers.authorization = `Bearer ${this.token}`;
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, output_style: 'json' }),
      });
    } catch (e) {
      return { error: `Analyzer request failed: ${(e as Error).message}`, code: 'UPSTREAM' };
    }

    if (!response.ok) {
      return { error: `Analyzer returned ${response.status}`, code: 'UPSTREAM' };
    }

    try {
      const raw = await response.json();
      const tokens = normalizeDictaBertPayload(text, raw);
      const issues = await enrichStructuralIssues(tokens, deriveStructuralIssues(tokens), this.lookupImpl);
      return { provider: this.provider, model: 'dictabert-joint', text, tokens, issues, raw };
    } catch (e) {
      return { error: `Could not parse analyzer response: ${(e as Error).message}`, code: 'PARSE' };
    }
  }
}

class WorkersAiAnalyzer implements Analyzer {
  provider: AnalysisProvider = 'workers-ai';

  constructor(private readonly ai: Ai) {}

  async analyze(text: string, request: AnalyzeRequest): Promise<AnalyzeResult | AnalyzeError> {
    const model = pickWorkersAiModel(request.model);
    try {
      const raw = await this.ai.run(model, {
        messages: grammarMessages(text),
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 700,
      } as any);
      return {
        provider: this.provider,
        model,
        text,
        tokens: [],
        issues: parseLlmIssues(text, raw),
        raw,
      };
    } catch (e) {
      return { error: `Workers AI analysis failed: ${(e as Error).message}`, code: 'UPSTREAM' };
    }
  }
}

class GeminiAnalyzer implements Analyzer {
  provider: AnalysisProvider = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string | undefined,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async analyze(text: string, request: AnalyzeRequest): Promise<AnalyzeResult | AnalyzeError> {
    const model = request.model || this.model || DEFAULT_GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: grammarPrompt(text) }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      });
    } catch (e) {
      return { error: `Gemini request failed: ${(e as Error).message}`, code: 'UPSTREAM' };
    }

    if (!response.ok) {
      return { error: `Gemini returned ${response.status}`, code: 'UPSTREAM' };
    }

    try {
      const raw = await response.json();
      return {
        provider: this.provider,
        model,
        text,
        tokens: [],
        issues: parseLlmIssues(text, raw),
        raw,
      };
    } catch (e) {
      return { error: `Could not parse Gemini response: ${(e as Error).message}`, code: 'PARSE' };
    }
  }
}

export function normalizeDictaBertPayload(text: string, payload: unknown): AnalysisToken[] {
  const rawTokens = extractDictaBertTokens(payload);
  let cursor = 0;

  return rawTokens.map((raw, index) => {
    const surface = readString(raw.token) || '';
    const offsets = readOffsets(raw.offsets, text.length);
    const start = offsets?.start ?? findSurface(text, surface, cursor);
    const end = offsets?.end ?? start + surface.length;
    cursor = end;

    return {
      index,
      surface,
      start,
      end,
      lemma: readString(raw.lex) || undefined,
      pos: readString(raw.morph?.pos) || undefined,
      feats: readStringRecord(raw.morph?.feats),
      prefixes: readStringArray(raw.morph?.prefixes),
      suffix: readSuffix(raw.morph?.suffix),
      segments: readStringArray(raw.seg),
      dependency: readDependency(raw.syntax),
    };
  });
}

export function deriveStructuralIssues(tokens: AnalysisToken[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  issues.push(...findRepeatedWords(tokens));
  issues.push(...findAdjectiveAgreementIssues(tokens));
  issues.push(...findSubjectVerbAgreementIssues(tokens));
  issues.push(...findVerbCoordinationIssues(tokens));
  return dedupeIssues(issues);
}

async function enrichStructuralIssues(
  tokens: AnalysisToken[],
  issues: GrammarIssue[],
  lookupImpl: MorphologyLookup | undefined,
): Promise<GrammarIssue[]> {
  if (!lookupImpl) return issues;

  return Promise.all(issues.map(async (issue) => {
    const verb = tokenForIssue(tokens, issue);
    if (!verb) return issue;

    let subject: AnalysisToken | null = null;
    let tenses: VerbTense[] | undefined;
    if (issue.id === 'adjective_agreement') {
      const adjective = verb;
      const noun = getHead(tokens, adjective);
      if (!noun) return issue;
      const replacements = await replacementsForAdjective(noun, adjective, lookupImpl);
      if (!replacements.length) return issue;
      return {
        ...issue,
        replacement: replacements[0].value,
        replacements,
      };
    }

    if (issue.id === 'subject_verb_agreement') {
      subject = subjectForVerb(tokens, verb);
    } else if (issue.id === 'verb_tense_coordination' || issue.id === 'verb_form_coordination') {
      subject = subjectForVerb(tokens, verb);
      const head = getHead(tokens, verb);
      const headTense = normalizeVerbTense(head?.feats.Tense);
      tenses = headTense ? [headTense] : undefined;
    } else {
      return issue;
    }
    if (!subject) return issue;

    const replacements = await replacementsForSubjectVerb(tokens, subject, verb, lookupImpl, tenses);
    if (!replacements.length) return issue;
    return {
      ...issue,
      replacement: replacements[0].value,
      replacements,
    };
  }));
}

async function replacementsForAdjective(
  noun: AnalysisToken,
  adjective: AnalysisToken,
  lookupImpl: MorphologyLookup,
): Promise<GrammarReplacement[]> {
  if (!adjective.lemma) return [];

  let result: LookupResult | LookupError;
  try {
    result = await lookupImpl(adjective.lemma);
  } catch {
    return [];
  }

  if ('code' in result) return [];
  const forms = result.adjectiveForms;
  if (!forms) return [];

  const form = adjectiveFormForNoun(forms, noun.feats);
  const plainForm = normalizeHebrew(form);
  if (!plainForm || normalizeHebrew(plainForm) === normalizeHebrew(adjective.surface)) return [];
  return [{ value: plainForm, label: adjectiveFormLabel(noun.feats) }];
}

function adjectiveFormForNoun(forms: AdjectiveForms, noun: Record<string, string>): string {
  const key = adjectiveKey(noun);
  return forms[key] ?? '';
}

function adjectiveKey(noun: Record<string, string>): keyof AdjectiveForms {
  const gender = noun.Gender === 'Fem' ? 'f' : 'm';
  const number = noun.Number === 'Plur' ? 'p' : 's';
  return `${gender}${number}` as keyof AdjectiveForms;
}

function adjectiveFormLabel(noun: Record<string, string>): string {
  return formatAgreementProfile({ feats: noun } as AnalysisToken, ['Gender', 'Number']);
}

function tokenForIssue(tokens: AnalysisToken[], issue: GrammarIssue): AnalysisToken | null {
  return tokens.find((token) => token.start === issue.start && token.end === issue.end) ?? null;
}

function subjectForVerb(tokens: AnalysisToken[], verb: AnalysisToken): AnalysisToken | null {
  const direct = tokens.find((token) =>
    token.dependency?.relation === 'nsubj'
    && token.dependency.head === verb.index,
  );
  if (direct) return direct;

  if (verb.dependency?.relation !== 'conj') return null;
  return tokens.find((token) =>
    token.dependency?.relation === 'nsubj'
    && token.dependency.head === verb.dependency?.head,
  ) ?? null;
}

async function replacementsForSubjectVerb(
  tokens: AnalysisToken[],
  subject: AnalysisToken,
  verb: AnalysisToken,
  lookupImpl: MorphologyLookup,
  forcedTenses?: VerbTense[],
): Promise<GrammarReplacement[]> {
  if (!verb.lemma) return [];

  let result: LookupResult | LookupError;
  try {
    result = await lookupImpl(verb.lemma);
  } catch {
    return [];
  }

  if ('code' in result || !result.isVerb) return [];
  const forms = result.voices?.active?.forms;
  if (!forms) return [];

  const tenses = forcedTenses ?? replacementTenses(tokens, verb);
  const seen = new Set<string>();
  const replacements: GrammarReplacement[] = [];
  for (const tense of tenses) {
    const form = conjugatedFormForSubject(forms, tense, subject.feats);
    const plainForm = normalizeHebrew(form);
    if (!plainForm || normalizeHebrew(plainForm) === normalizeHebrew(verb.surface)) continue;
    const value = preserveConjunctionPrefix(verb, plainForm);
    const key = normalizeHebrew(value);
    if (seen.has(key)) continue;
    seen.add(key);
    replacements.push({ value, label: TENSE_LABELS[tense] });
  }

  return replacements;
}

function replacementTenses(tokens: AnalysisToken[], verb: AnalysisToken): VerbTense[] {
  const contextTense = temporalContextTense(tokens, verb);
  if (contextTense) return [contextTense];

  const analyzerTense = normalizeVerbTense(verb.feats.Tense);
  if (analyzerTense === 'past') return ['past', 'present'];
  if (analyzerTense) return [analyzerTense];
  return ['present'];
}

function conjugatedFormForSubject(
  forms: Conjugation,
  tense: VerbTense,
  subject: Record<string, string>,
): string {
  if (tense === 'present') {
    return forms.present[presentKey(subject)] ?? '';
  }
  if (tense === 'past') {
    return forms.past[pastKey(subject)] ?? '';
  }
  if (tense === 'future') {
    return forms.future[futureKey(subject)] ?? '';
  }
  return '';
}

function normalizeVerbTense(tense: string | undefined): VerbTense | null {
  if (tense === 'Past') return 'past';
  if (tense === 'Pres') return 'present';
  if (tense === 'Fut' || tense === 'Future') return 'future';
  return null;
}

function temporalContextTense(tokens: AnalysisToken[], verb: AnalysisToken): VerbTense | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.index === verb.index || token.pos === 'VERB') continue;

    const direct = temporalMarkerTense(tokens, i);
    if (direct) return direct;
  }
  return null;
}

function temporalMarkerTense(tokens: AnalysisToken[], index: number): VerbTense | null {
  const token = tokens[index];
  const surface = normalizeHebrew(token.surface);
  const lemma = normalizeHebrew(token.lemma ?? '');
  const marker = TEMPORAL_TENSE_MARKERS[surface] ?? TEMPORAL_TENSE_MARKERS[lemma];
  if (marker) return marker;

  if (!TEMPORAL_UNIT_LEMMAS.has(lemma)) return null;
  const prev = normalizedTokenAt(tokens, index - 1);
  const next = normalizedTokenAt(tokens, index + 1);
  if (prev === 'לפני' || PAST_CONTEXT_WORDS.has(next)) return 'past';
  if (prev === 'בעוד' || FUTURE_CONTEXT_WORDS.has(next)) return 'future';
  return null;
}

function normalizedTokenAt(tokens: AnalysisToken[], index: number): string {
  const token = tokens[index];
  if (!token) return '';
  return normalizeHebrew(token.lemma || token.surface);
}

function presentKey(subject: Record<string, string>): keyof Conjugation['present'] {
  const gender = subject.Gender === 'Fem' ? 'f' : 'm';
  const number = subject.Number === 'Plur' ? 'p' : 's';
  return `${gender}${number}` as keyof Conjugation['present'];
}

function pastKey(subject: Record<string, string>): keyof Conjugation['past'] {
  if (subject.Person === '1') return subject.Number === 'Plur' ? '1p' : '1s';
  if (subject.Person === '2') return personGenderNumberKey('2', subject) as keyof Conjugation['past'];
  if (subject.Number === 'Plur') return '3p';
  return subject.Gender === 'Fem' ? '3fs' : '3ms';
}

function futureKey(subject: Record<string, string>): keyof Conjugation['future'] {
  if (subject.Person === '1') return subject.Number === 'Plur' ? '1p' : '1s';
  const person = subject.Person === '2' ? '2' : '3';
  return personGenderNumberKey(person, subject) as keyof Conjugation['future'];
}

function personGenderNumberKey(person: '2' | '3', subject: Record<string, string>): string {
  const gender = subject.Gender === 'Fem' ? 'f' : 'm';
  const number = subject.Number === 'Plur' ? 'p' : 's';
  return `${person}${gender}${number}`;
}

function preserveConjunctionPrefix(token: AnalysisToken, form: string): string {
  if (
    token.surface.startsWith('ו')
    && !form.startsWith('ו')
    && (token.prefixes.includes('CCONJ') || token.segments[0] === 'ו')
  ) {
    return `ו${form}`;
  }
  return form;
}

function findRepeatedWords(tokens: AnalysisToken[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const token = tokens[i];
    if (!prev.surface || !token.surface) continue;
    if (normalizeHebrew(prev.surface) !== normalizeHebrew(token.surface)) continue;
    issues.push({
      id: 'repeated_word',
      source: 'rule',
      severity: 'warning',
      message: 'Repeated word',
      start: token.start,
      end: token.end,
      evidence: `${prev.surface} ${token.surface}`,
      hint: 'Remove one of the repeated words.',
      suggestions: ['Delete the duplicate word.'],
    });
  }
  return issues;
}

function findAdjectiveAgreementIssues(tokens: AnalysisToken[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  for (const token of tokens) {
    if (token.pos !== 'ADJ' || token.dependency?.relation !== 'amod') continue;
    const head = getHead(tokens, token);
    if (!head || !isNominal(head.pos)) continue;
    const mismatch = agreementMismatch(head, token, ['Gender', 'Number']);
    if (!mismatch.length) continue;
    issues.push({
      id: 'adjective_agreement',
      source: 'rule',
      severity: 'error',
      message: 'Adjective does not agree with the noun',
      start: token.start,
      end: token.end,
      evidence: formatMismatch(head, token, mismatch),
      hint: agreementHint(head, 'adjective'),
      suggestions: agreementSuggestions(head, token, mismatch, 'adjective'),
    });
  }
  return issues;
}

function findSubjectVerbAgreementIssues(tokens: AnalysisToken[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  for (const subject of tokens) {
    if (subject.dependency?.relation !== 'nsubj') continue;
    const verb = getHead(tokens, subject);
    if (!verb || verb.pos !== 'VERB') continue;
    for (const candidate of [verb, ...conjoinedVerbs(tokens, verb)]) {
      const mismatch = subjectVerbMismatch(subject, candidate);
      if (!mismatch.length) continue;
      issues.push({
        id: 'subject_verb_agreement',
        source: 'rule',
        severity: 'error',
        message: 'Subject and verb do not agree',
        start: candidate.start,
        end: candidate.end,
        evidence: formatMismatch(subject, candidate, mismatch),
        hint: agreementHint(subject, 'verb'),
        suggestions: agreementSuggestions(subject, candidate, mismatch, 'verb'),
      });
    }
  }
  return issues;
}

function subjectVerbMismatch(subject: AnalysisToken, verb: AnalysisToken): string[] {
  const personMismatch = agreementMismatch(subject, verb, ['Person']);
  if (personMismatch.length) return personMismatch;
  return agreementMismatch(subject, verb, ['Gender', 'Number']);
}

function conjoinedVerbs(tokens: AnalysisToken[], verb: AnalysisToken): AnalysisToken[] {
  return tokens.filter((token) =>
    token.pos === 'VERB'
    && token.dependency?.relation === 'conj'
    && token.dependency.head === verb.index,
  );
}

function findVerbCoordinationIssues(tokens: AnalysisToken[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  for (const verb of tokens) {
    if (verb.pos !== 'VERB' || !hasFiniteAgreement(verb)) continue;
    if (!hasSubject(tokens, verb)) continue;
    const verbTense = normalizeVerbTense(verb.feats.Tense);
    for (const candidate of conjoinedVerbs(tokens, verb)) {
      if (!hasFiniteAgreement(candidate)) {
        issues.push({
          id: 'verb_form_coordination',
          source: 'rule',
          severity: 'warning',
          message: 'Coordinated verbs use different forms',
          start: candidate.start,
          end: candidate.end,
          evidence: `verb form mismatch: ${verb.surface} is finite, ${candidate.surface} has no finite agreement features`,
          hint: `Use the same verb form type as ${verb.surface}.`,
          suggestions: ['Coordinate another finite verb form instead of an infinitive or bare verbal form.'],
        });
        continue;
      }

      const missing = missingFiniteFeatures(verb, candidate);
      if (missing.length) {
        issues.push({
          id: 'verb_form_coordination',
          source: 'rule',
          severity: 'warning',
          message: 'Coordinated verb is missing finite-form features',
          start: candidate.start,
          end: candidate.end,
          evidence: `verb form mismatch: ${verb.surface} is ${formatFiniteProfile(verb)}, ${candidate.surface} is missing ${formatFeatureList(missing)}`,
          hint: `Use a ${formatFiniteProfile(verb)} verb form here to match ${verb.surface}.`,
          suggestions: [`If ${candidate.surface} is intended, use it in a separate clause with its own subject or time context.`],
        });
        continue;
      }

      const candidateTense = normalizeVerbTense(candidate.feats.Tense);
      if (!verbTense || !candidateTense || verbTense === candidateTense) continue;
      issues.push({
        id: 'verb_tense_coordination',
        source: 'rule',
        severity: 'warning',
        message: 'Coordinated verbs use different tenses',
        start: candidate.start,
        end: candidate.end,
        evidence: `tense mismatch: ${verb.surface} is ${TENSE_LABELS[verbTense].toLowerCase()}, ${candidate.surface} is ${TENSE_LABELS[candidateTense].toLowerCase()}`,
        hint: `Use ${TENSE_LABELS[verbTense].toLowerCase()} tense here to match ${verb.surface}.`,
        suggestions: [`If ${candidate.surface} is intended, use ${TENSE_LABELS[candidateTense].toLowerCase()} tense consistently in the coordinated verbs.`],
      });
    }
  }
  return issues;
}

function missingFiniteFeatures(reference: AnalysisToken, candidate: AnalysisToken): string[] {
  return ['Person', 'Tense'].filter((feature) => reference.feats[feature] && !candidate.feats[feature]);
}

function formatFiniteProfile(token: AnalysisToken): string {
  return [
    formatTenseValue(normalizeVerbTense(token.feats.Tense)),
    formatFeatureValue(token.feats.Person),
    formatFeatureValue(token.feats.Gender),
    formatFeatureValue(token.feats.Number),
  ].filter(Boolean).join(' ');
}

function formatTenseValue(tense: VerbTense | null): string {
  return tense ? TENSE_LABELS[tense].toLowerCase() : '';
}

function formatFeatureList(features: string[]): string {
  return features.map(formatFeatureName).join(' and ');
}

function hasSubject(tokens: AnalysisToken[], verb: AnalysisToken): boolean {
  return tokens.some((token) =>
    token.dependency?.relation === 'nsubj'
    && token.dependency.head === verb.index,
  );
}

function hasFiniteAgreement(token: AnalysisToken): boolean {
  return Boolean(token.feats.Person || token.feats.Gender || token.feats.Number || token.feats.Tense);
}

function agreementMismatch(
  left: AnalysisToken,
  right: AnalysisToken,
  features: string[],
): string[] {
  return features.filter((feature) => {
    const a = left.feats[feature];
    const b = right.feats[feature];
    return a && b && a !== b;
  });
}

function getHead(tokens: AnalysisToken[], token: AnalysisToken): AnalysisToken | null {
  const head = token.dependency?.head;
  if (typeof head !== 'number' || head < 0 || head >= tokens.length) return null;
  return tokens[head] ?? null;
}

function isNominal(pos: string | undefined): boolean {
  return pos === 'NOUN' || pos === 'PROPN' || pos === 'PRON';
}

function formatMismatch(left: AnalysisToken, right: AnalysisToken, features: string[]): string {
  return features
    .map((feature) => {
      const leftValue = formatFeatureValue(left.feats[feature]);
      const rightValue = formatFeatureValue(right.feats[feature]);
      return `${formatFeatureName(feature)} mismatch: ${left.surface} is ${leftValue}, ${right.surface} is ${rightValue}`;
    })
    .join(', ');
}

function agreementHint(anchor: AnalysisToken, target: 'adjective' | 'verb'): string {
  const profile = formatAgreementProfile(anchor, target === 'verb'
    ? ['Person', 'Gender', 'Number']
    : ['Gender', 'Number']);
  if (!profile) return `Use a ${target} form that agrees with ${anchor.surface}.`;
  return `Use a ${profile} ${target} form to agree with ${anchor.surface}.`;
}

function agreementSuggestions(
  anchor: AnalysisToken,
  current: AnalysisToken,
  features: string[],
  target: 'adjective' | 'verb',
): string[] {
  const suggestions: string[] = [];
  if (target === 'verb' && features.includes('Person') && current.feats.Person) {
    suggestions.push(`If ${current.surface} is intended, use a ${formatFeatureValue(current.feats.Person)} subject instead.`);
  }
  return suggestions;
}

function formatAgreementProfile(token: AnalysisToken, features: string[]): string {
  return features
    .map((feature) => formatFeatureValue(token.feats[feature]))
    .filter(Boolean)
    .join(' ');
}

function formatFeatureName(feature: string): string {
  return feature.toLowerCase();
}

function formatFeatureValue(value: string): string {
  const values: Record<string, string> = {
    '1': 'first-person',
    '2': 'second-person',
    '3': 'third-person',
    Fem: 'feminine',
    Masc: 'masculine',
    Sing: 'singular',
    Plur: 'plural',
  };
  return values[value] ?? value;
}

function extractDictaBertTokens(payload: unknown): DictaBertToken[] {
  if (Array.isArray(payload)) return payload.flatMap(extractDictaBertTokens);
  if (!payload || typeof payload !== 'object') return [];

  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.tokens)) return obj.tokens as DictaBertToken[];
  if (Array.isArray(obj.sentences)) return obj.sentences.flatMap(extractDictaBertTokens);
  if (Array.isArray(obj.data)) return obj.data.flatMap(extractDictaBertTokens);
  if (Array.isArray(obj.results)) return obj.results.flatMap(extractDictaBertTokens);

  return [];
}

function readDependency(raw: DictaBertToken['syntax']): AnalysisToken['dependency'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const head = typeof raw.dep_head_idx === 'number' ? raw.dep_head_idx : Number(raw.dep_head_idx);
  const relation = readString(raw.dep_func);
  if (!Number.isInteger(head) || !relation) return undefined;
  return { head, relation };
}

function readOffsets(raw: DictaBertToken['offsets'], textLength: number): { start: number; end: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const start = typeof raw.start === 'number' ? raw.start : Number(raw.start);
  const end = typeof raw.end === 'number' ? raw.end : Number(raw.end);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || end > textLength) return null;
  return { start, end };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string') out[key] = val;
  }
  return out;
}

function readSuffix(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function findSurface(text: string, surface: string, from: number): number {
  if (!surface) return from;
  const exact = text.indexOf(surface, from);
  if (exact >= 0) return exact;
  const later = text.indexOf(surface);
  return later >= 0 ? later : from;
}

function normalizeHebrew(text: string): string {
  return text.normalize('NFKC').replace(/[\u0591-\u05c7]/g, '');
}

function dedupeIssues(issues: GrammarIssue[]): GrammarIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.id}:${issue.start}:${issue.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickWorkersAiModel(model: string | undefined): (typeof WORKERS_AI_GRAMMAR_MODELS)[number] {
  return WORKERS_AI_GRAMMAR_MODELS.includes(model as any)
    ? (model as (typeof WORKERS_AI_GRAMMAR_MODELS)[number])
    : DEFAULT_WORKERS_AI_MODEL;
}

function grammarMessages(text: string): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content: 'Return only JSON. Analyze Hebrew grammar, style, and lexical misuse. Do not report spelling-only issues.',
    },
    { role: 'user', content: grammarPrompt(text) },
  ];
}

function grammarPrompt(text: string): string {
  return [
    'Analyze this Hebrew text and return JSON shaped as:',
    '{"issues":[{"id":"short_snake_case","severity":"info|warning|error","message":"English explanation","start":0,"end":0,"replacement":"best Hebrew replacement","replacements":[{"value":"optional Hebrew replacement","label":"optional label"}],"evidence":"short evidence","hint":"short guidance","suggestions":["optional suggestion"]}]}',
    'Offsets are JavaScript string offsets into the exact input. If unsure about an offset, omit the issue.',
    'Input:',
    text,
  ].join('\n');
}

function parseLlmIssues(text: string, raw: unknown): GrammarIssue[] {
  const parsed = parseJsonObject(extractGeneratedText(raw));
  if (!parsed || !Array.isArray(parsed.issues)) return [];

  return parsed.issues
    .map((issue: unknown): GrammarIssue | null => normalizeLlmIssue(text, issue))
    .filter((issue): issue is GrammarIssue => issue !== null);
}

function normalizeLlmIssue(text: string, issue: unknown): GrammarIssue | null {
  if (!issue || typeof issue !== 'object') return null;
  const obj = issue as Record<string, unknown>;
  const start = typeof obj.start === 'number' ? obj.start : -1;
  const end = typeof obj.end === 'number' ? obj.end : -1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) {
    return null;
  }

  const severity = obj.severity === 'info' || obj.severity === 'warning' || obj.severity === 'error'
    ? obj.severity
    : 'warning';
  const replacement = readString(obj.replacement) || undefined;
  const replacements = readReplacementArray(obj.replacements, replacement);

  return {
    id: readString(obj.id) || 'llm_grammar_issue',
    source: 'llm',
    severity,
    message: readString(obj.message) || 'Possible grammar issue',
    start,
    end,
    replacement,
    replacements,
    evidence: readString(obj.evidence) || undefined,
    hint: readString(obj.hint) || undefined,
    suggestions: readStringArray(obj.suggestions).filter(Boolean),
  };
}

function readReplacementArray(value: unknown, fallback: string | undefined): GrammarReplacement[] | undefined {
  const out: GrammarReplacement[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        if (item) out.push({ value: item });
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const replacementValue = readString(obj.value);
        if (replacementValue) out.push({ value: replacementValue, label: readString(obj.label) || undefined });
      }
    }
  }
  if (!out.length && fallback) out.push({ value: fallback });
  return out.length ? out : undefined;
}

function parseJsonObject(text: string | null): { issues?: unknown[] } | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as { issues?: unknown[] };
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as { issues?: unknown[] };
    } catch {
      return null;
    }
  }
}

function extractGeneratedText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, any>;
  if (typeof obj.response === 'string') return obj.response;
  if (typeof obj.output_text === 'string') return obj.output_text;
  if (Array.isArray(obj.candidates)) {
    for (const candidate of obj.candidates) {
      const parts = candidate?.content?.parts;
      if (!Array.isArray(parts)) continue;
      const text = parts.map((part: any) => part?.text).filter(Boolean).join('\n');
      if (text) return text;
    }
  }
  return null;
}
