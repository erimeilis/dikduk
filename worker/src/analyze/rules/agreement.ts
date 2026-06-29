import type { AnalysisToken, GrammarIssue } from '../types';
import {
  agreementHint,
  agreementMismatch,
  agreementSuggestions,
  conjoinedVerbs,
  formatMismatch,
  getHead,
  isNominal,
} from './formatting';

export function findAdjectiveAgreementIssues(tokens: AnalysisToken[]): GrammarIssue[] {
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

export function findSubjectVerbAgreementIssues(tokens: AnalysisToken[]): GrammarIssue[] {
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
