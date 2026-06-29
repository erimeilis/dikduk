import { el } from '../popup';
import type { GrammarIssue } from './protocol';

const TITLES: Record<string, string> = {
  adjective_agreement: 'Adjective agreement',
  subject_verb_agreement: 'Subject/verb agreement',
  repeated_word: 'Repeated word',
  verb_form_coordination: 'Verb form coordination',
  verb_tense_coordination: 'Verb tense coordination',
};

export function renderGrammarIssue(issue: GrammarIssue, text: string): HTMLElement {
  const wrap = el('div', 'pealim-popup pealim-grammar-popup');
  wrap.setAttribute('dir', 'rtl');

  const phrase = text.slice(issue.start, issue.end);
  wrap.appendChild(el('div', 'pealim-lemma', phrase || issue.id));
  wrap.appendChild(el('div', 'pealim-translation', TITLES[issue.id] ?? issue.message));
  wrap.appendChild(el('div', 'pealim-meta', issue.message));

  if (issue.evidence) {
    wrap.appendChild(el('div', 'pealim-grammar-evidence', issue.evidence));
  }

  const replacements = hebrewReplacements(issue);
  if (replacements.length) {
    const box = el('div', 'pealim-grammar-replacements');
    box.appendChild(el(
      'div',
      'pealim-grammar-suggestions-title',
      replacements.length === 1 ? 'Hebrew suggestion' : 'Hebrew suggestions',
    ));
    for (const replacement of replacements) {
      const item = el(
        'div',
        'pealim-grammar-replacement',
        replacement.label ? `${replacement.label}: ${replacement.value}` : replacement.value,
      );
      item.setAttribute('dir', 'auto');
      box.appendChild(item);
    }
    wrap.appendChild(box);
  }

  if (issue.hint) {
    const hint = el('div', 'pealim-grammar-hint', issue.hint);
    hint.setAttribute('dir', 'auto');
    wrap.appendChild(hint);
  }

  const suggestions = issue.suggestions?.filter(Boolean).slice(0, 3) ?? [];
  if (suggestions.length) {
    const box = el('div', 'pealim-grammar-suggestions');
    box.appendChild(el('div', 'pealim-grammar-suggestions-title', 'Suggestions'));
    for (const suggestion of suggestions) {
      const item = el('div', 'pealim-grammar-suggestion', suggestion);
      item.setAttribute('dir', 'auto');
      box.appendChild(item);
    }
    wrap.appendChild(box);
  }

  return wrap;
}

function hebrewReplacements(issue: GrammarIssue): { value: string; label?: string }[] {
  const replacements = issue.replacements?.filter((item) => item.value).slice(0, 4);
  if (replacements?.length) return replacements;
  return issue.replacement ? [{ value: issue.replacement }] : [];
}
