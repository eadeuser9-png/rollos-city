-- V19 additive community memory. No existing saved data is modified or reset.
-- Keys are salted server-side browser pseudonyms, never proof of a real identity.
CREATE TABLE IF NOT EXISTS rollo_contributor_links (
 kind TEXT NOT NULL CHECK (kind IN ('forum','photo')),
 submission_id INTEGER NOT NULL,
 visitor_key TEXT NOT NULL,
 PRIMARY KEY (kind, submission_id)
);
CREATE TABLE IF NOT EXISTS rollo_social_memories (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 source_kind TEXT NOT NULL CHECK (source_kind IN ('forum','photo')),
 source_id INTEGER,
 visitor_key TEXT,
 alias TEXT NOT NULL,
 kind TEXT NOT NULL,
 excerpt TEXT NOT NULL,
 decision TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollo_social_source ON rollo_social_memories(source_kind,source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rollo_social_visitor ON rollo_social_memories(visitor_key,id);
