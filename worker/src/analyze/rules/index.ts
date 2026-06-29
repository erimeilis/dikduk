import type { AnalysisToken, GrammarIssue } from '../types';
import { findRepeatedWords } from './repeated';
import { findAdjectiveAgreementIssues, findSubjectVerbAgreementIssues } from './agreement';
import { findVerbCoordinationIssues } from './coordination';

export function deriveStructuralIssues(tokens: AnalysisToken[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  issues.push(...findRepeatedWords(tokens));
  issues.push(...findAdjectiveAgreementIssues(tokens));
  issues.push(...findSubjectVerbAgreementIssues(tokens));
  issues.push(...findVerbCoordinationIssues(tokens));
  return dedupeIssues(issues);
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
