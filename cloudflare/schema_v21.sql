-- V21 ADDITIVE migration. Run on EXISTING D1 after taking a backup.
-- Do not reset existing world state, social memories, library or progress.
CREATE TABLE IF NOT EXISTS creator_profile (
 id INTEGER PRIMARY KEY CHECK(id=1),
 nickname TEXT NOT NULL DEFAULT '',
 context TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS creator_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 sender TEXT NOT NULL CHECK(sender IN ('owner','rollo')),
 body TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_messages_created ON creator_messages(created_at DESC);
-- Uploaded owner .txt books are stored in existing library_books using NEGATIVE IDs.
-- Project Gutenberg IDs stay positive, so neither source can overwrite the other.
