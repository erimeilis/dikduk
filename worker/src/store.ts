import type { LookupResult } from './types';

export interface Store {
  get(query: string): Promise<LookupResult | null>;
  put(query: string, result: LookupResult): Promise<void>;
}

export function createD1Store(db: D1Database): Store {
  return {
    async get(query: string): Promise<LookupResult | null> {
      const row = await db
        .prepare('SELECT e.data AS data FROM aliases a JOIN entries e ON e.id = a.entry_id WHERE a.query_key = ?')
        .bind(query)
        .first<{ data: string }>();
      return row ? (JSON.parse(row.data) as LookupResult) : null;
    },

    async put(query: string, result: LookupResult): Promise<void> {
      const now = Date.now();
      const upserted = await db
        .prepare(
          `INSERT INTO entries (slug, lemma, root, translation, is_verb, binyan, data, source_url, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             lemma=excluded.lemma, root=excluded.root, translation=excluded.translation,
             is_verb=excluded.is_verb, binyan=excluded.binyan, data=excluded.data,
             source_url=excluded.source_url, fetched_at=excluded.fetched_at
           RETURNING id`,
        )
        .bind(
          result.slug,
          result.lemma,
          result.root,
          result.translation,
          result.isVerb ? 1 : 0,
          result.voices?.active?.binyan ?? null,
          JSON.stringify(result),
          result.sourceUrl,
          now,
        )
        .first<{ id: number }>();

      if (!upserted) throw new Error(`entries upsert returned no id for slug ${result.slug}`);
      const entryId = upserted.id;

      await db
        .prepare('INSERT OR IGNORE INTO aliases (query_key, entry_id, created_at) VALUES (?, ?, ?)')
        .bind(query, entryId, now)
        .run();

      for (const ref of result.seeAlso) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO see_also (from_id, to_slug, to_id, label)
             VALUES (?, ?, (SELECT id FROM entries WHERE slug = ?), ?)`,
          )
          .bind(entryId, ref.slug, ref.slug, ref.label)
          .run();
      }

      // Resolve any dangling references that point at this newly-stored slug.
      await db
        .prepare('UPDATE see_also SET to_id = ? WHERE to_slug = ? AND to_id IS NULL')
        .bind(entryId, result.slug)
        .run();
    },
  };
}
