import { parseDictPage, parseDictHeader } from '../src/lookup/dict-parser';
import { normalizeQuery } from '../src/lookup/normalize';
import type { LookupResult, Conjugation } from '../src/lookup/types';

export function slugFromLocation(location: string): string | null {
  const m = location.match(/\/dict\/\d+-([^/?#]+)\/?/);
  return m ? m[1] : null;
}

/** True for statuses that warrant a retry-with-backoff (rate limiting or server errors); false for genuine misses (e.g. 404) or success. */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Exponential backoff in ms for the given (0-based) consecutive-retry attempt, capped at a max delay. Deterministic — no jitter/randomness. */
export function backoffMs(attempt: number, baseMs: number, maxMs = 10 * 60 * 1000): number {
  return Math.min(baseMs * 2 ** attempt, maxMs);
}

export function buildResult(html: string, slug: string, id: number): LookupResult {
  const head = parseDictHeader(html);
  const page = parseDictPage(html);
  const inflectionKind = head.isVerb ? 'verb' : page.adjectiveForms ? 'adjective' : 'other';
  return {
    word: normalizeQuery(head.lemma),
    lemma: head.lemma,
    slug,
    translation: head.translation,
    root: head.root,
    isVerb: head.isVerb,
    inflectionKind,
    ...(page.voices ? { voices: page.voices } : {}),
    ...(page.adjectiveForms ? { adjectiveForms: page.adjectiveForms } : {}),
    seeAlso: page.seeAlso,
    sourceUrl: `https://www.pealim.com/dict/${id}-${slug}/`,
  };
}

function conjugationForms(c: Conjugation): string[] {
  return [
    c.present.ms, c.present.fs, c.present.mp, c.present.fp,
    ...Object.values(c.past), ...Object.values(c.future), ...Object.values(c.imperative),
    c.infinitive,
  ];
}

export function collectAliases(result: LookupResult): string[] {
  const raw = [result.lemma];
  if (result.voices?.active) raw.push(...conjugationForms(result.voices.active.forms));
  if (result.voices?.passive) raw.push(...conjugationForms(result.voices.passive.forms));
  if (result.adjectiveForms) raw.push(...Object.values(result.adjectiveForms));
  const seen = new Set<string>();
  for (const form of raw) {
    const key = normalizeQuery(form);
    if (key) seen.add(key);
  }
  return [...seen];
}

/** SQLite single-quote escaping: doubles each `'` so the value is safe inside a quoted literal. */
export function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

function sqlString(s: string): string {
  return `'${sqlEscape(s)}'`;
}

function sqlNullableString(s: string | null | undefined): string {
  return s === null || s === undefined ? 'NULL' : sqlString(s);
}

/**
 * Builds the SQL statements to upsert one scraped entry, matching the runtime
 * write semantics in `src/storage/d1-store.ts`: an `entries` upsert keyed on
 * slug, one `aliases` INSERT OR IGNORE per alias (entry_id resolved via a
 * slug subquery), and one `see_also` INSERT OR IGNORE per reference.
 */
export function entryToSql(result: LookupResult, aliases: string[], nowMs: number): string {
  const statements: string[] = [];

  statements.push(
    `INSERT INTO entries (slug, lemma, root, translation, is_verb, binyan, data, source_url, fetched_at)
VALUES (${sqlString(result.slug)}, ${sqlString(result.lemma)}, ${sqlNullableString(result.root)}, ${sqlString(result.translation)}, ${result.isVerb ? 1 : 0}, ${sqlNullableString(result.voices?.active?.binyan ?? null)}, ${sqlString(JSON.stringify(result))}, ${sqlString(result.sourceUrl)}, ${nowMs})
ON CONFLICT(slug) DO UPDATE SET
  lemma=excluded.lemma, root=excluded.root, translation=excluded.translation,
  is_verb=excluded.is_verb, binyan=excluded.binyan, data=excluded.data,
  source_url=excluded.source_url, fetched_at=excluded.fetched_at;`,
  );

  for (const alias of aliases) {
    statements.push(
      `INSERT OR IGNORE INTO aliases (query_key, entry_id, created_at) VALUES (${sqlString(alias)}, (SELECT id FROM entries WHERE slug=${sqlString(result.slug)}), ${nowMs});`,
    );
  }

  for (const ref of result.seeAlso) {
    statements.push(
      `INSERT OR IGNORE INTO see_also (from_id, to_slug, to_id, label) VALUES ((SELECT id FROM entries WHERE slug=${sqlString(result.slug)}), ${sqlString(ref.slug)}, (SELECT id FROM entries WHERE slug=${sqlString(ref.slug)}), ${sqlString(ref.label)});`,
    );
  }

  return statements.join('\n');
}
