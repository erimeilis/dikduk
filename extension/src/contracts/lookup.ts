// Lookup wire types — the shape returned by the lookup Worker and rendered by the
// popup. Single source of truth for the lookup contract.

export interface Conjugation {
  present: { ms: string; fs: string; mp: string; fp: string };
  past: {
    '1s': string; '1p': string;
    '2ms': string; '2fs': string; '2mp': string; '2fp': string;
    '3ms': string; '3fs': string; '3p': string;
  };
  future: {
    '1s': string; '1p': string;
    '2ms': string; '2fs': string; '2mp': string; '2fp': string;
    '3ms': string; '3fs': string; '3mp': string; '3fp': string;
  };
  imperative: { '2ms': string; '2fs': string; '2mp': string; '2fp': string };
  infinitive: string;
}

// Adjective inflection forms the Worker already returns. Typed here (optional) to
// fix the drift between the Worker's response shape and the extension's contract.
export interface AdjectiveForms {
  ms: string;
  fs: string;
  mp: string;
  fp: string;
}

export interface Voice {
  binyan: string | null;
  forms: Conjugation;
}

export interface SeeAlsoRef {
  label: string;
  slug: string;
}

export type InflectionKind = 'verb' | 'adjective' | 'other';

export type ErrorCode = 'NO_RESULTS' | 'UPSTREAM' | 'PARSE';

export interface LookupResult {
  word: string;
  lemma: string;
  slug: string;
  translation: string;
  root: string;
  isVerb: boolean;
  // Optional fields the Worker already returns — typed here to close the drift.
  // No new rendering behavior is attached to them.
  inflectionKind?: InflectionKind;
  voices?: { active?: Voice; passive?: Voice };
  adjectiveForms?: AdjectiveForms;
  seeAlso: SeeAlsoRef[];
  sourceUrl: string;
}

export interface LookupError {
  error: string;
  code: ErrorCode;
}

export type LookupResponse = LookupResult | LookupError;

export function isLookupError(r: LookupResponse): r is LookupError {
  return (r as LookupError).code !== undefined;
}
