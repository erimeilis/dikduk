import type { AnalysisToken, GrammarIssue } from '../types';
import { normalizeHebrew } from '../../shared/hebrew';

export function findRepeatedWords(tokens: AnalysisToken[]): GrammarIssue[] {
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
