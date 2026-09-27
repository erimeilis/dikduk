import type { GrammarIssue, GrammarReplacement } from './types';
import { readString, readStringArray } from '../shared/parse';

export function grammarMessages(text: string): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content: 'Return only JSON. Analyze Hebrew grammar, style, and lexical misuse. Do not report spelling-only issues.',
    },
    { role: 'user', content: grammarPrompt(text) },
  ];
}

export function grammarPrompt(text: string): string {
  return [
    // Fields are described, not shown as sample values: weak models copy sample
    // values verbatim (an issue id of "short_snake_case" reached users).
    'Analyze this Hebrew text and return a JSON object {"issues": [...]}, where each issue has:',
    '- id: snake_case name of the error type, e.g. gender_agreement, subject_verb_agreement, wrong_preposition',
    '- severity: one of info, warning, error',
    '- message: one English sentence explaining this specific mistake',
    '- start, end: offsets of the mistaken word(s) in the input',
    '- replacement: the corrected Hebrew text for that span',
    '- optional: replacements (array of {value, label}), evidence, hint, suggestions (array of strings)',
    'Return {"issues": []} when the text has no grammar mistakes.',
    'Offsets are JavaScript string offsets into the exact input. If unsure about an offset, omit the issue.',
    'Input:',
    text,
  ].join('\n');
}

// Values from the old prompt template: an issue carrying them was copied from
// the instructions, not found in the text.
const TEMPLATE_ECHOES = new Set(['short_snake_case', 'English explanation']);

// The refresh probe: does this model's reply flag the known agreement error in
// the probe sentence (a feminine subject with a masculine verb, הלך)?
export function findsProbeError(probe: string, raw: unknown): boolean {
  const start = probe.indexOf('הלך');
  if (start < 0) return false;
  const end = start + 'הלך'.length;
  return parseLlmIssues(probe, raw).some((issue) => issue.start < end && start < issue.end);
}

export function parseLlmIssues(text: string, raw: unknown): GrammarIssue[] {
  const parsed = parseJsonObject(extractGeneratedText(raw));
  if (!parsed || !Array.isArray(parsed.issues)) return [];

  return parsed.issues
    .map((issue: unknown): GrammarIssue | null => normalizeLlmIssue(text, issue))
    .filter((issue): issue is GrammarIssue => issue !== null);
}

function normalizeLlmIssue(text: string, issue: unknown): GrammarIssue | null {
  if (!issue || typeof issue !== 'object') return null;
  const obj = issue as Record<string, unknown>;
  if (TEMPLATE_ECHOES.has(readString(obj.id)) || TEMPLATE_ECHOES.has(readString(obj.message))) return null;
  const start = typeof obj.start === 'number' ? obj.start : -1;
  const end = typeof obj.end === 'number' ? obj.end : -1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) {
    return null;
  }

  const severity = obj.severity === 'info' || obj.severity === 'warning' || obj.severity === 'error'
    ? obj.severity
    : 'warning';
  const replacement = readString(obj.replacement) || undefined;
  const replacements = readReplacementArray(obj.replacements, replacement);

  return {
    id: readString(obj.id) || 'llm_grammar_issue',
    source: 'llm',
    severity,
    message: readString(obj.message) || 'Possible grammar issue',
    start,
    end,
    replacement,
    replacements,
    evidence: readString(obj.evidence) || undefined,
    hint: readString(obj.hint) || undefined,
    suggestions: readStringArray(obj.suggestions).filter(Boolean),
  };
}

function readReplacementArray(value: unknown, fallback: string | undefined): GrammarReplacement[] | undefined {
  const out: GrammarReplacement[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        if (item) out.push({ value: item });
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const replacementValue = readString(obj.value);
        if (replacementValue) out.push({ value: replacementValue, label: readString(obj.label) || undefined });
      }
    }
  }
  if (!out.length && fallback) out.push({ value: fallback });
  return out.length ? out : undefined;
}

function parseJsonObject(text: string | null): { issues?: unknown[] } | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as { issues?: unknown[] };
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as { issues?: unknown[] };
    } catch {
      return null;
    }
  }
}

export function extractGeneratedText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, any>;
  if (typeof obj.response === 'string') return obj.response;
  if (typeof obj.output_text === 'string') return obj.output_text;
  // OpenAI-style shape (e.g. kimi-k2.6): choices[].message.content. Reasoning
  // models put their thinking in reasoning_content and the answer in content,
  // so only content is the payload we want.
  if (Array.isArray(obj.choices)) {
    for (const choice of obj.choices) {
      const content = choice?.message?.content;
      if (typeof content === 'string' && content.trim()) return content;
    }
  }
  if (Array.isArray(obj.candidates)) {
    for (const candidate of obj.candidates) {
      const parts = candidate?.content?.parts;
      if (!Array.isArray(parts)) continue;
      const text = parts.map((part: any) => part?.text).filter(Boolean).join('\n');
      if (text) return text;
    }
  }
  return null;
}
