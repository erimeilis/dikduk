import type { AnalysisToken, GrammarIssue } from '../types';
import {
  conjoinedVerbs,
  formatFeatureList,
  formatFiniteProfile,
  hasFiniteAgreement,
  hasSubject,
  normalizeVerbTense,
  TENSE_LABELS,
} from './formatting';

export function findVerbCoordinationIssues(tokens: AnalysisToken[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  for (const verb of tokens) {
    if (verb.pos !== 'VERB' || !hasFiniteAgreement(verb)) continue;
    if (!hasSubject(tokens, verb)) continue;
    const verbTense = normalizeVerbTense(verb.feats.Tense);
    for (const candidate of conjoinedVerbs(tokens, verb)) {
      if (!hasFiniteAgreement(candidate)) {
        issues.push({
          id: 'verb_form_coordination',
          source: 'rule',
          severity: 'warning',
          message: 'Coordinated verbs use different forms',
          start: candidate.start,
          end: candidate.end,
          evidence: `verb form mismatch: ${verb.surface} is finite, ${candidate.surface} has no finite agreement features`,
          hint: `Use the same verb form type as ${verb.surface}.`,
          suggestions: ['Coordinate another finite verb form instead of an infinitive or bare verbal form.'],
        });
        continue;
      }

      const missing = missingFiniteFeatures(verb, candidate);
      if (missing.length) {
        issues.push({
          id: 'verb_form_coordination',
          source: 'rule',
          severity: 'warning',
          message: 'Coordinated verb is missing finite-form features',
          start: candidate.start,
          end: candidate.end,
          evidence: `verb form mismatch: ${verb.surface} is ${formatFiniteProfile(verb)}, ${candidate.surface} is missing ${formatFeatureList(missing)}`,
          hint: `Use a ${formatFiniteProfile(verb)} verb form here to match ${verb.surface}.`,
          suggestions: [`If ${candidate.surface} is intended, use it in a separate clause with its own subject or time context.`],
        });
        continue;
      }

      const candidateTense = normalizeVerbTense(candidate.feats.Tense);
      if (!verbTense || !candidateTense || verbTense === candidateTense) continue;
      issues.push({
        id: 'verb_tense_coordination',
        source: 'rule',
        severity: 'warning',
        message: 'Coordinated verbs use different tenses',
        start: candidate.start,
        end: candidate.end,
        evidence: `tense mismatch: ${verb.surface} is ${TENSE_LABELS[verbTense].toLowerCase()}, ${candidate.surface} is ${TENSE_LABELS[candidateTense].toLowerCase()}`,
        hint: `Use ${TENSE_LABELS[verbTense].toLowerCase()} tense here to match ${verb.surface}.`,
        suggestions: [`If ${candidate.surface} is intended, use ${TENSE_LABELS[candidateTense].toLowerCase()} tense consistently in the coordinated verbs.`],
      });
    }
  }
  return issues;
}

function missingFiniteFeatures(reference: AnalysisToken, candidate: AnalysisToken): string[] {
  return ['Person', 'Tense'].filter((feature) => reference.feats[feature] && !candidate.feats[feature]);
}
