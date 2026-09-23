CREATE TABLE IF NOT EXISTS films (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  file_path    TEXT NOT NULL UNIQUE,
  duration_sec INTEGER,
  poster       TEXT,
  year         INTEGER,
  synopsis     TEXT,
  added_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_films_title ON films(title);
