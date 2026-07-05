// Grammar-analysis wire types: the request sent to the analyzer Worker and the
// issue/replacement shapes it returns.

export interface GrammarAnalyzeRequest { type: 'grammar-analyze'; text: string }

export interface GrammarReplacement {
  value: string;
  label?: string;
}

export interface GrammarIssue {
  id: string;
  source: 'rule' | 'llm';
  severity: 'info' | 'warning' | 'error';
  message: string;
  start: number;
  end: number;
  replacement?: string;
  replacements?: GrammarReplacement[];
  evidence?: string;
  hint?: string;
  suggestions?: string[];
}

export interface GrammarAnalyzeResult { issues: GrammarIssue[] }
export interface GrammarAnalyzeErrorResult { error: string; code?: string }
export type GrammarResult = GrammarAnalyzeResult | GrammarAnalyzeErrorResult;
