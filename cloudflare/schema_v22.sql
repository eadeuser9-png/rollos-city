-- V22 ADDITIVE: source-grounded reading observations. Never reset existing tables.
-- Do not call these general-world facts. They are observations about quoted text.
CREATE TABLE IF NOT EXISTS reading_insights (
 history_id INTEGER PRIMARY KEY REFERENCES reading_history(id),
 book_id INTEGER NOT NULL REFERENCES library_books(id),
 topic TEXT NOT NULL,
 observation TEXT NOT NULL,
 evidence TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reading_insights_book ON reading_insights(book_id, created_at DESC);
