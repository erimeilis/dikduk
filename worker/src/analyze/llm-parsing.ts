import type { GrammarIssue, GrammarReplacement } from './types';
import { readString, readStringArray } from '../shared/parse';

export const WORKERS_AI_GRAMMAR_MODELS = [
  '@cf/google/gemma-3-12b-it',
  '@cf/moonshotai/kimi-k2.6',
] as const;

const DEFAULT_WORKERS_AI_MODEL = WORKERS_AI_GRAMMAR_MODELS[0];

export function pickWorkersAiModel(model: string | undefined): (typeof WORKERS_AI_GRAMMAR_MODELS)[number] {
  return WORKERS_AI_GRAMMAR_MODELS.includes(model as any)
    ? (model as (typeof WORKERS_AI_GRAMMAR_MODELS)[number])
    : DEFAULT_WORKERS_AI_MODEL;
}

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
    'Analyze this Hebrew text and return JSON shaped as:',
    '{"issues":[{"id":"short_snake_case","severity":"info|warning|error","message":"English explanation","start":0,"end":0,"replacement":"best Hebrew replacement","replacements":[{"value":"optional Hebrew replacement","label":"optional label"}],"evidence":"short evidence","hint":"short guidance","suggestions":["optional suggestion"]}]}',
    'Offsets are JavaScript string offsets into the exact input. If unsure about an offset, omit the issue.',
    'Input:',
    text,
  ].join('\n');
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
