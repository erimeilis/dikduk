import { describe, it, expect } from 'vitest';
import { grammarPrompt, parseLlmIssues, findsProbeError } from '../../src/analyze/llm-parsing';

const reply = (issues: unknown[]) => ({ response: JSON.stringify({ issues }) });

describe('grammarPrompt', () => {
  it('describes the fields instead of showing placeholder values a model could copy', () => {
    const prompt = grammarPrompt('הספר טובה');
    expect(prompt).not.toContain('short_snake_case');
    expect(prompt).not.toContain('"English explanation"');
    expect(prompt).toContain('gender_agreement');
  });
});

describe('parseLlmIssues', () => {
  it('drops issues that echo the old template placeholders', () => {
    const text = 'הספר טובה';
    const issues = parseLlmIssues(text, reply([
      { id: 'short_snake_case', severity: 'error', message: 'English explanation', start: 5, end: 9 },
      { id: 'gender_agreement', severity: 'error', message: 'Adjective must be masculine', start: 5, end: 9 },
    ]));
    expect(issues.map((i) => i.id)).toEqual(['gender_agreement']);
  });
});

describe('findsProbeError', () => {
  // 'הילדה הלך הביתה' — feminine subject, masculine verb: the error is at הלך (6..9).
  const probe = 'הילדה הלך הביתה';

  it('accepts a reply that flags the verb', () => {
    expect(findsProbeError(probe, reply([
      { id: 'subject_verb_agreement', severity: 'error', message: 'Verb must be feminine', start: 6, end: 9 },
    ]))).toBe(true);
  });

  it('rejects an empty or placeholder-only reply', () => {
    expect(findsProbeError(probe, reply([]))).toBe(false);
    expect(findsProbeError(probe, reply([
      { id: 'short_snake_case', severity: 'error', message: 'English explanation', start: 6, end: 9 },
    ]))).toBe(false);
  });

  it('rejects a reply that flags the wrong word', () => {
    expect(findsProbeError(probe, reply([
      { id: 'style', severity: 'info', message: 'x', start: 10, end: 15 },
    ]))).toBe(false);
  });
});
