import { parseDictPage, parseDictHeader } from '../src/lookup/dict-parser';
import { normalizeQuery } from '../src/lookup/normalize';
import type { LookupResult, Conjugation } from '../src/lookup/types';

export function buildResult(html: string, slug: string, id: number): LookupResult {
  const head = parseDictHeader(html);
  const page = parseDictPage(html);
  const inflectionKind = head.isVerb ? 'verb' : page.adjectiveForms ? 'adjective' : 'other';
  return {
    word: normalizeQuery(head.lemma),
    lemma: head.lemma,
    slug,
    translation: head.translation,
    root: head.root,
    isVerb: head.isVerb,
    inflectionKind,
    ...(page.voices ? { voices: page.voices } : {}),
    ...(page.adjectiveForms ? { adjectiveForms: page.adjectiveForms } : {}),
    seeAlso: page.seeAlso,
    sourceUrl: `https://www.pealim.com/dict/${id}-${slug}/`,
  };
}

function conjugationForms(c: Conjugation): string[] {
  return [
    c.present.ms, c.present.fs, c.present.mp, c.present.fp,
    ...Object.values(c.past), ...Object.values(c.future), ...Object.values(c.imperative),
    c.infinitive,
  ];
}

export function collectAliases(result: LookupResult): string[] {
  const raw = [result.lemma];
  if (result.voices?.active) raw.push(...conjugationForms(result.voices.active.forms));
  if (result.voices?.passive) raw.push(...conjugationForms(result.voices.passive.forms));
  if (result.adjectiveForms) raw.push(...Object.values(result.adjectiveForms));
  const seen = new Set<string>();
  for (const form of raw) {
    const key = normalizeQuery(form);
    if (key) seen.add(key);
  }
  return [...seen];
}
