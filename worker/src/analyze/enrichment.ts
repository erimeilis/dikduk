import type { AdjectiveForms, Conjugation, LookupError, LookupResult } from '../lookup/types';
import type { AnalysisToken, GrammarIssue, GrammarReplacement, MorphologyLookup, VerbTense } from './types';
import { normalizeHebrew } from '../shared/hebrew';
import {
  formatAgreementProfile,
  getHead,
  normalizeVerbTense,
  TENSE_LABELS,
} from './rules/formatting';

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

export async function enrichStructuralIssues(
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
