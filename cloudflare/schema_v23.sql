-- V23 additive: visitor-suggested books, invisible to Rollo until readable text
-- is separately and legally added by the owner. No existing records are reset.
CREATE TABLE IF NOT EXISTS book_suggestions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 author TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL DEFAULT '',
 source_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at INTEGER NOT NULL,
 reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_book_suggestions_status ON book_suggestions(status, created_at DESC);
