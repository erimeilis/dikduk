CREATE TABLE entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  lemma       TEXT NOT NULL,
  root        TEXT,
  translation TEXT NOT NULL,
  is_verb     INTEGER NOT NULL,
  binyan      TEXT,
  data        TEXT NOT NULL,
  source_url  TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);
CREATE TABLE aliases (
  query_key  TEXT PRIMARY KEY,
  entry_id   INTEGER NOT NULL REFERENCES entries(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE see_also (
  from_id  INTEGER NOT NULL REFERENCES entries(id),
  to_slug  TEXT NOT NULL,
  to_id    INTEGER REFERENCES entries(id),
  label    TEXT NOT NULL,
  PRIMARY KEY (from_id, to_slug)
);
CREATE INDEX idx_entries_lemma ON entries(lemma);
CREATE INDEX idx_entries_root  ON entries(root);
CREATE INDEX idx_see_also_to_slug ON see_also(to_slug);
