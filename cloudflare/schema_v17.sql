-- V17 real-book library. Additive migration; does not reset world state, drawings, or journals.
CREATE TABLE IF NOT EXISTS library_books(
 id INTEGER PRIMARY KEY,
 title TEXT NOT NULL,
 author TEXT NOT NULL,
 tags TEXT NOT NULL DEFAULT '',
 source_url TEXT NOT NULL,
 text_url TEXT,
 book_text TEXT,
 chars INTEGER NOT NULL DEFAULT 0,
 added_at INTEGER NOT NULL,
 retry_after INTEGER
);
CREATE TABLE IF NOT EXISTS reading_progress(
 book_id INTEGER PRIMARY KEY REFERENCES library_books(id),
 position INTEGER NOT NULL DEFAULT 0,
 sessions INTEGER NOT NULL DEFAULT 0,
 last_read_at INTEGER,
 finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS reading_history(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 book_id INTEGER NOT NULL REFERENCES library_books(id),
 day INTEGER NOT NULL,
 stamp TEXT NOT NULL,
 offset_start INTEGER NOT NULL,
 offset_end INTEGER NOT NULL,
 excerpt TEXT NOT NULL,
 reaction TEXT NOT NULL,
 question TEXT NOT NULL DEFAULT '',
 thought_source TEXT NOT NULL CHECK(thought_source IN ('ai','basic')),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_history_created ON reading_history(created_at DESC);
