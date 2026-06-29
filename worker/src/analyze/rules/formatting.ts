import type { AnalysisToken, VerbTense } from '../types';

export const TENSE_LABELS: Record<VerbTense, string> = {
  past: 'Past',
  present: 'Present',
  future: 'Future',
};

export function normalizeVerbTense(tense: string | undefined): VerbTense | null {
  if (tense === 'Past') return 'past';
  if (tense === 'Pres') return 'present';
  if (tense === 'Fut' || tense === 'Future') return 'future';
  return null;
}

export function getHead(tokens: AnalysisToken[], token: AnalysisToken): AnalysisToken | null {
  const head = token.dependency?.head;
  if (typeof head !== 'number' || head < 0 || head >= tokens.length) return null;
  return tokens[head] ?? null;
}

export function isNominal(pos: string | undefined): boolean {
  return pos === 'NOUN' || pos === 'PROPN' || pos === 'PRON';
}

export function conjoinedVerbs(tokens: AnalysisToken[], verb: AnalysisToken): AnalysisToken[] {
  return tokens.filter((token) =>
    token.pos === 'VERB'
    && token.dependency?.relation === 'conj'
    && token.dependency.head === verb.index,
  );
}

export function hasSubject(tokens: AnalysisToken[], verb: AnalysisToken): boolean {
  return tokens.some((token) =>
    token.dependency?.relation === 'nsubj'
    && token.dependency.head === verb.index,
  );
}

export function hasFiniteAgreement(token: AnalysisToken): boolean {
  return Boolean(token.feats.Person || token.feats.Gender || token.feats.Number || token.feats.Tense);
}

export function agreementMismatch(
  left: AnalysisToken,
  right: AnalysisToken,
  features: string[],
): string[] {
  return features.filter((feature) => {
    const a = left.feats[feature];
    const b = right.feats[feature];
    return a && b && a !== b;
  });
}

export function formatMismatch(left: AnalysisToken, right: AnalysisToken, features: string[]): string {
  return features
    .map((feature) => {
      const leftValue = formatFeatureValue(left.feats[feature]);
      const rightValue = formatFeatureValue(right.feats[feature]);
      return `${formatFeatureName(feature)} mismatch: ${left.surface} is ${leftValue}, ${right.surface} is ${rightValue}`;
    })
    .join(', ');
}

export function agreementHint(anchor: AnalysisToken, target: 'adjective' | 'verb'): string {
  const profile = formatAgreementProfile(anchor, target === 'verb'
    ? ['Person', 'Gender', 'Number']
    : ['Gender', 'Number']);
  if (!profile) return `Use a ${target} form that agrees with ${anchor.surface}.`;
  return `Use a ${profile} ${target} form to agree with ${anchor.surface}.`;
}

export function agreementSuggestions(
  anchor: AnalysisToken,
  current: AnalysisToken,
  features: string[],
  target: 'adjective' | 'verb',
): string[] {
  const suggestions: string[] = [];
  if (target === 'verb' && features.includes('Person') && current.feats.Person) {
    suggestions.push(`If ${current.surface} is intended, use a ${formatFeatureValue(current.feats.Person)} subject instead.`);
  }
  return suggestions;
}

export function formatAgreementProfile(token: AnalysisToken, features: string[]): string {
  return features
    .map((feature) => formatFeatureValue(token.feats[feature]))
    .filter(Boolean)
    .join(' ');
}

export function formatFeatureName(feature: string): string {
  return feature.toLowerCase();
}

export function formatFeatureValue(value: string): string {
  const values: Record<string, string> = {
    '1': 'first-person',
    '2': 'second-person',
    '3': 'third-person',
    Fem: 'feminine',
    Masc: 'masculine',
    Sing: 'singular',
    Plur: 'plural',
  };
  return values[value] ?? value;
}

export function formatFiniteProfile(token: AnalysisToken): string {
  return [
    formatTenseValue(normalizeVerbTense(token.feats.Tense)),
    formatFeatureValue(token.feats.Person),
    formatFeatureValue(token.feats.Gender),
    formatFeatureValue(token.feats.Number),
  ].filter(Boolean).join(' ');
}

export function formatTenseValue(tense: VerbTense | null): string {
  return tense ? TENSE_LABELS[tense].toLowerCase() : '';
}

export function formatFeatureList(features: string[]): string {
  return features.map(formatFeatureName).join(' and ');
}
