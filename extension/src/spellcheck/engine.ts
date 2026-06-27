export interface SpellEngine {
  correct(word: string): boolean;
  check(tokens: string[]): string[];
  suggest(word: string): string[];
}

interface PrefixRule {
  flag: string;
  add: string;
  match: RegExp | null;
}

interface Suggestion {
  word: string;
  score: number;
}

const MAX_SUGGESTION_DISTANCE = 2;
const FINAL_LETTERS = new Map([
  ['כ', 'ך'],
  ['מ', 'ם'],
  ['נ', 'ן'],
  ['פ', 'ף'],
  ['צ', 'ץ'],
]);

export function createDictionaryEngine(aff: string, dic: string): SpellEngine {
  const entries = parseDictionary(dic);
  const prefixRules = parsePrefixRules(aff);
  const wordsByLength = bucketWordsByLength(entries);

  function correct(word: string): boolean {
    if (entries.has(word)) return true;

    const rules = prefixRules.get(word[0]);
    if (!rules) return false;

    for (const rule of rules) {
      if (!word.startsWith(rule.add) || word.length === rule.add.length) continue;
      const stem = word.slice(rule.add.length);
      const flags = entries.get(stem);
      if (!flags?.includes(rule.flag)) continue;
      if (rule.match && !rule.match.test(stem)) continue;
      return true;
    }

    return false;
  }

  function suggest(word: string): string[] {
    const seeded = seedSuggestions(word, correct);
    const seen = new Set(seeded);
    const candidates: Suggestion[] = [];
    const minLength = Math.max(1, word.length - MAX_SUGGESTION_DISTANCE);
    const maxLength = word.length + MAX_SUGGESTION_DISTANCE;

    for (let length = minLength; length <= maxLength; length++) {
      for (const candidate of wordsByLength.get(length) ?? []) {
        if (candidate === word || seen.has(candidate)) continue;
        const score = editDistanceAtMost(word, candidate, MAX_SUGGESTION_DISTANCE);
        if (score !== null) candidates.push({ word: candidate, score });
      }
    }

    const ranked = candidates
      .sort((a, b) =>
        a.score - b.score ||
        Math.abs(a.word.length - word.length) - Math.abs(b.word.length - word.length) ||
        commonPrefixLength(b.word, word) - commonPrefixLength(a.word, word),
      )
      .slice(0, 6)
      .map((candidate) => candidate.word);
    return [...seeded, ...ranked].slice(0, 6);
  }

  return {
    correct,
    check(tokens: string[]): string[] {
      return tokens.filter((word) => !correct(word));
    },
    suggest,
  };
}

function seedSuggestions(word: string, correct: (word: string) => boolean): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (candidate: string) => {
    if (candidate !== word && !seen.has(candidate) && correct(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  };

  const final = FINAL_LETTERS.get(word.at(-1) ?? '');
  if (final) add(word.slice(0, -1) + final);

  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch !== word[i - 1] && ch !== 'ו' && ch !== 'י') continue;
    add(word.slice(0, i) + word.slice(i + 1));
  }

  return out;
}

function parseDictionary(dic: string): Map<string, string> {
  const entries = new Map<string, string>();
  const lines = dic.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^\d+$/.test(trimmed)) continue;

    const [rawEntry] = trimmed.split(/\s+/, 1);
    const slash = rawEntry.indexOf('/');
    const word = slash === -1 ? rawEntry : rawEntry.slice(0, slash);
    const flags = slash === -1 ? '' : rawEntry.slice(slash + 1);
    if (word) entries.set(word, flags);
  }

  return entries;
}

function parsePrefixRules(aff: string): Map<string, PrefixRule[]> {
  const rules = new Map<string, PrefixRule[]>();

  for (const line of aff.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('PFX ')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue; // header line: PFX <flag> <cross> <count>

    const [, flag, remove, addSpec, source] = parts;
    if (remove !== '0') continue;

    const add = addSpec.split('/')[0];
    if (!add || add === '0') continue;

    let match: RegExp | null = null;
    try {
      match = source === '.' ? null : new RegExp(`^${source}`);
    } catch {
      continue;
    }

    const bucket = rules.get(add[0]) ?? [];
    bucket.push({ flag, add, match });
    rules.set(add[0], bucket);
  }

  for (const bucket of rules.values()) {
    bucket.sort((a, b) => b.add.length - a.add.length);
  }

  return rules;
}

function bucketWordsByLength(entries: Map<string, string>): Map<number, string[]> {
  const buckets = new Map<number, string[]>();

  for (const word of entries.keys()) {
    const bucket = buckets.get(word.length) ?? [];
    bucket.push(word);
    buckets.set(word.length, bucket);
  }

  return buckets;
}

function commonPrefixLength(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  let index = 0;
  while (index < length && a[index] === b[index]) index++;
  return index;
}

function editDistanceAtMost(a: string, b: string, max: number): number | null {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > max) return null;

  let previous = Array.from({ length: n + 1 }, (_, i) => i);
  let current = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (rowMin > max) return null;
    [previous, current] = [current, previous];
  }

  return previous[n] <= max ? previous[n] : null;
}
