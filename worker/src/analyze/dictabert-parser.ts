import type { AnalysisToken, DictaBertToken } from './types';
import { readString, readStringArray, readStringRecord, toNumber } from '../shared/parse';

export function normalizeDictaBertPayload(text: string, payload: unknown): AnalysisToken[] {
  const rawTokens = extractDictaBertTokens(payload);
  let cursor = 0;

  return rawTokens.map((raw, index) => {
    const surface = readString(raw.token) || '';
    const offsets = readOffsets(raw.offsets, text.length);
    const start = offsets?.start ?? findSurface(text, surface, cursor);
    const end = offsets?.end ?? start + surface.length;
    cursor = end;

    return {
      index,
      surface,
      start,
      end,
      lemma: readString(raw.lex) || undefined,
      pos: readString(raw.morph?.pos) || undefined,
      feats: readStringRecord(raw.morph?.feats),
      prefixes: readStringArray(raw.morph?.prefixes),
      suffix: readSuffix(raw.morph?.suffix),
      segments: readStringArray(raw.seg),
      dependency: readDependency(raw.syntax),
    };
  });
}

function extractDictaBertTokens(payload: unknown): DictaBertToken[] {
  if (Array.isArray(payload)) return payload.flatMap(extractDictaBertTokens);
  if (!payload || typeof payload !== 'object') return [];

  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.tokens)) return obj.tokens as DictaBertToken[];
  if (Array.isArray(obj.sentences)) return obj.sentences.flatMap(extractDictaBertTokens);
  if (Array.isArray(obj.data)) return obj.data.flatMap(extractDictaBertTokens);
  if (Array.isArray(obj.results)) return obj.results.flatMap(extractDictaBertTokens);

  return [];
}

function readDependency(raw: DictaBertToken['syntax']): AnalysisToken['dependency'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const head = typeof raw.dep_head_idx === 'number' ? raw.dep_head_idx : toNumber(raw.dep_head_idx);
  const relation = readString(raw.dep_func);
  if (!Number.isInteger(head) || !relation) return undefined;
  return { head, relation };
}

function readOffsets(raw: DictaBertToken['offsets'], textLength: number): { start: number; end: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const start = typeof raw.start === 'number' ? raw.start : toNumber(raw.start);
  const end = typeof raw.end === 'number' ? raw.end : toNumber(raw.end);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || end > textLength) return null;
  return { start, end };
}

function readSuffix(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function findSurface(text: string, surface: string, from: number): number {
  if (!surface) return from;
  const exact = text.indexOf(surface, from);
  if (exact >= 0) return exact;
  const later = text.indexOf(surface);
  return later >= 0 ? later : from;
}
