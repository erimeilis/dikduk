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

export interface LookupResult {
  word: string;
  lemma: string;
  translation: string;
  root: string;
  isVerb: boolean;
  binyan?: string;
  conjugation?: Conjugation;
  sourceUrl: string;
}

export type ErrorCode = 'NO_RESULTS' | 'UPSTREAM' | 'PARSE';

export interface LookupError {
  error: string;
  code: ErrorCode;
}

export interface SearchResult {
  lemma: string;
  root: string;
  translation: string;
  isVerb: boolean;
  dictUrl: string;
  binyan?: string;
}
