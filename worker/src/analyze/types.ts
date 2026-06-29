import type { LookupResult, LookupError } from '../lookup/types';

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

export type MorphologyLookup = (query: string) => Promise<LookupResult | LookupError>;

export interface AnalyzeDeps {
  env?: AnalyzeEnv;
  fetchImpl?: typeof fetch;
  lookupImpl?: MorphologyLookup;
}

export interface Analyzer {
  provider: AnalysisProvider;
  analyze(text: string, request: AnalyzeRequest): Promise<AnalyzeResult | AnalyzeError>;
}

export type DictaBertToken = {
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

export type VerbTense = 'past' | 'present' | 'future';
