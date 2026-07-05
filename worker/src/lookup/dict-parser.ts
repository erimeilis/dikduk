import { parse, type HTMLElement } from 'node-html-parser';
import type { AdjectiveForms, Conjugation, Voice, SeeAlsoRef } from './types';

// Keep Pealim's primary spelling ("primary ~ alternate" → "primary"), drop zero-width and
// bidi control chars (U+200B–U+200F, U+202A–U+202E), collapse whitespace.
function cleanText(s: string): string {
  return s
    .split('~')[0]
    .replace(/[​-‏‪-‮]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PRESENT_IDS = { ms: 'AP-ms', fs: 'AP-fs', mp: 'AP-mp', fp: 'AP-fp' } as const;
const PAST_IDS = {
  '1s': 'PERF-1s', '1p': 'PERF-1p',
  '2ms': 'PERF-2ms', '2fs': 'PERF-2fs', '2mp': 'PERF-2mp', '2fp': 'PERF-2fp',
  '3ms': 'PERF-3ms', '3fs': 'PERF-3fs', '3p': 'PERF-3p',
} as const;
const FUTURE_IDS = {
  '1s': 'IMPF-1s', '1p': 'IMPF-1p',
  '2ms': 'IMPF-2ms', '2fs': 'IMPF-2fs', '2mp': 'IMPF-2mp', '2fp': 'IMPF-2fp',
  '3ms': 'IMPF-3ms', '3fs': 'IMPF-3fs', '3mp': 'IMPF-3mp', '3fp': 'IMPF-3fp',
} as const;
const IMP_IDS = { '2ms': 'IMP-2ms', '2fs': 'IMP-2fs', '2mp': 'IMP-2mp', '2fp': 'IMP-2fp' } as const;
const ADJECTIVE_IDS = { ms: 'ms-a', fs: 'fs-a', mp: 'mp-a', fp: 'fp-a' } as const;

function formById(root: HTMLElement, id: string): string {
  const cell = root.getElementById(id);
  if (!cell) return '';
  const menukad = cell.querySelector('.menukad');
  return cleanText(menukad?.text ?? cell.text);
}

function mapForms<K extends string>(root: HTMLElement, ids: Record<K, string>, prefix: string): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(ids) as K[]) out[key] = formById(root, prefix + ids[key]);
  return out;
}

function readVoice(root: HTMLElement, prefix: string): Conjugation {
  return {
    present: {
      ms: formById(root, prefix + PRESENT_IDS.ms),
      fs: formById(root, prefix + PRESENT_IDS.fs),
      mp: formById(root, prefix + PRESENT_IDS.mp),
      fp: formById(root, prefix + PRESENT_IDS.fp),
    },
    past: mapForms(root, PAST_IDS, prefix),
    future: mapForms(root, FUTURE_IDS, prefix),
    imperative: mapForms(root, IMP_IDS, prefix),
    infinitive: formById(root, prefix + 'INF-L'),
  };
}

function hasForms(c: Conjugation): boolean {
  return (
    !!c.present.ms || !!c.infinitive ||
    Object.values(c.past).some(Boolean) || Object.values(c.future).some(Boolean)
  );
}

function binyanFor(root: HTMLElement, headerStart: string): string | null {
  for (const h of root.querySelectorAll('h3.page-header')) {
    if (h.text.trim().startsWith(headerStart)) {
      return (h.querySelector('.small')?.text ?? '').replace(/^Binyan\s+/i, '').trim() || null;
    }
  }
  return null;
}

function parseSeeAlso(root: HTMLElement): SeeAlsoRef[] {
  const out: SeeAlsoRef[] = [];
  const tbl = root.querySelector('table.dict-table-t');
  if (!tbl) return out;
  for (const a of tbl.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? '';
    const m = href.match(/^\/dict\/(\d+-[^/?#]+)\/$/);
    if (!m) continue;
    const raw = a.querySelector('.menukad')?.text;
    const label = raw ? cleanText(raw) : undefined;
    if (label) out.push({ label, slug: m[1] });
  }
  return out;
}

function readAdjectiveForms(root: HTMLElement): AdjectiveForms | undefined {
  const forms: AdjectiveForms = {
    ms: formById(root, ADJECTIVE_IDS.ms),
    fs: formById(root, ADJECTIVE_IDS.fs),
    mp: formById(root, ADJECTIVE_IDS.mp),
    fp: formById(root, ADJECTIVE_IDS.fp),
  };
  return Object.values(forms).some(Boolean) ? forms : undefined;
}

export interface DictHeader {
  lemma: string;
  translation: string;
  root: string;
  isVerb: boolean;
}

// The dict page has no <h1>; the lemma appears as plain text in the leading text node of
// "<h2 class="page-header">Conjugation of <lemma> <span>...</span></h2>" for verb pages, or
// "Inflection of <lemma> <span>...</span>" for noun/adjective pages (the trailing span holds a
// print-only URL, so read only the first text node and strip the leading "<Word> of" prefix).
function lemmaFromPageHeader(root: HTMLElement): string {
  const h2 = root.querySelector('h2.page-header');
  const firstText = h2?.childNodes.find((n) => n.nodeType === 3)?.rawText ?? '';
  return cleanText(firstText.replace(/^(?:Conjugation|Inflection|Declension) of\s+/i, ''));
}

// The root radicals are the "Root: א - כ - ל" line — scope to the <p> whose text starts with
// "Root:" (rather than "first .menukad on page") so this stays correct regardless of markup
// ordering elsewhere on the page.
function rootFromLabel(root: HTMLElement): string {
  const rootP = root.querySelectorAll('p').find((p) => /^Root:/.test(p.text));
  const text = rootP?.querySelector('.menukad')?.text ?? '';
  return cleanText(text).replace(/\s*-\s*/g, '־');
}

export function parseDictHeader(html: string): DictHeader {
  const root = parse(html);
  const lemma = lemmaFromPageHeader(root);
  // The word's definition lives in `.lead` ("to eat"); `.meaning` holds per-conjugation
  // glosses ("I / you eat") and must not be used here.
  const translation = cleanText(root.querySelector('.lead')?.text ?? '');
  const rootText = rootFromLabel(root);
  const isVerb = !!parseDictPage(html).voices?.active;
  return { lemma, translation, root: rootText, isVerb };
}

export function parseDictPage(
  html: string,
): { voices?: { active?: Voice; passive?: Voice }; adjectiveForms?: AdjectiveForms; seeAlso: SeeAlsoRef[] } {
  const root = parse(html);

  const activeForms = readVoice(root, '');
  const passiveForms = readVoice(root, 'passive-');

  const voices: { active?: Voice; passive?: Voice } = {};
  if (hasForms(activeForms)) voices.active = { binyan: binyanFor(root, 'Active forms'), forms: activeForms };
  if (hasForms(passiveForms)) voices.passive = { binyan: binyanFor(root, 'Passive forms'), forms: passiveForms };

  return {
    voices: voices.active || voices.passive ? voices : undefined,
    adjectiveForms: readAdjectiveForms(root),
    seeAlso: parseSeeAlso(root),
  };
}
