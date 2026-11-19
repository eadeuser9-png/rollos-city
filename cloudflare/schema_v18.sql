-- Consolidated low-poly town release: additive diagnostics only.
-- Never drops or edits saved world_state, creations, books, money or visitor content.
CREATE TABLE IF NOT EXISTS art_ai_diagnostics (
 kind TEXT PRIMARY KEY CHECK(kind='art'),
 attempts INTEGER NOT NULL DEFAULT 0,
 successes INTEGER NOT NULL DEFAULT 0,
 invalid_responses INTEGER NOT NULL DEFAULT 0,
 model_errors INTEGER NOT NULL DEFAULT 0,
 last_result TEXT,
 last_attempt_at INTEGER,
 last_success_at INTEGER
);
