import { describe, expect, it } from 'vitest';
import { renderGrammarIssue } from '../src/spellcheck/grammar-popup';

describe('renderGrammarIssue', () => {
  it('renders evidence, Hebrew replacements, hint, and secondary suggestions', () => {
    const node = renderGrammarIssue({
      id: 'subject_verb_agreement',
      source: 'rule',
      severity: 'error',
      message: 'Subject and verb do not agree',
      start: 4,
      end: 8,
      evidence: 'person mismatch: היא is third-person, אמרת is second-person',
      replacement: 'אמרה',
      replacements: [
        { value: 'אמרה', label: 'Past' },
        { value: 'אומרת', label: 'Present' },
      ],
      hint: 'Use a third-person feminine singular verb form to agree with היא.',
      suggestions: [
        'If אמרת is intended, use a second-person subject instead.',
      ],
    }, 'היא אמרת ולומדת');

    expect(node.textContent).toContain('person mismatch');
    expect(node.textContent).toContain('Hebrew suggestions');
    expect(node.textContent).toContain('Past: אמרה');
    expect(node.textContent).toContain('Present: אומרת');
    expect(node.textContent).toContain('Use a third-person feminine singular verb form');
    expect(node.textContent).toContain('If אמרת is intended');
    expect(node.querySelectorAll('.dikduk-grammar-replacement')).toHaveLength(2);
    expect(node.querySelectorAll('.dikduk-grammar-suggestion')).toHaveLength(1);
  });
});
