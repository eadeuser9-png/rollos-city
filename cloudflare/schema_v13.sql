-- V13 is an ADDITIVE migration. It does not modify the saved world or delete coins there.
-- Legacy coins are stripped only when the updated Worker next saves the state.
CREATE TABLE IF NOT EXISTS stripe_listing_links (
 creation_id INTEGER PRIMARY KEY,
 payment_link_id TEXT NOT NULL UNIQUE,
 FOREIGN KEY(creation_id) REFERENCES rollo_creations(id)
);
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
 event_id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 received_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stripe_sales (
 session_id TEXT PRIMARY KEY,
 payment_intent_id TEXT,
 payment_link_id TEXT NOT NULL,
 gross_cents INTEGER NOT NULL CHECK(gross_cents > 0),
 refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents >= 0),
 disputed INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_sales_intent ON stripe_sales(payment_intent_id);
CREATE TABLE IF NOT EXISTS wallet_cleared_deposits (
 reference TEXT PRIMARY KEY,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
 note TEXT NOT NULL DEFAULT '',
 confirmed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rollo_wishlist (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 item TEXT NOT NULL,
 category TEXT NOT NULL,
 reason TEXT NOT NULL,
 topic TEXT NOT NULL,
 origin TEXT NOT NULL CHECK(origin IN ('ai','rules','owner','market')),
 state TEXT NOT NULL DEFAULT 'wished' CHECK(state IN ('wished','dismissed')),
 store_url TEXT NOT NULL DEFAULT '',
 total_cents INTEGER,
 decided_day INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wishlist_created ON rollo_wishlist(created_at);
CREATE TABLE IF NOT EXISTS wallet_reservations (
 wishlist_id INTEGER PRIMARY KEY,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
 status TEXT NOT NULL CHECK(status IN ('reserved','spent','released')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 FOREIGN KEY(wishlist_id) REFERENCES rollo_wishlist(id)
);

-- Preserve /admin/ai-status if the earlier optional diagnostic migration was not installed.
CREATE TABLE IF NOT EXISTS ai_diagnostics (
 kind TEXT PRIMARY KEY CHECK(kind IN ('decisions','thoughts','forum')),
 attempts INTEGER NOT NULL DEFAULT 0,
 successes INTEGER NOT NULL DEFAULT 0,
 invalid_responses INTEGER NOT NULL DEFAULT 0,
 model_errors INTEGER NOT NULL DEFAULT 0,
 last_result TEXT,
 last_attempt_at INTEGER,
 last_success_at INTEGER
);

-- Curated, non-transactional offers for the Night Market. Every link must be owner-authored.
CREATE TABLE IF NOT EXISTS market_offers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 item TEXT NOT NULL,
 category TEXT NOT NULL,
 interest_topic TEXT NOT NULL,
 merchant TEXT NOT NULL,
 product_url TEXT NOT NULL,
 listed_price_cents INTEGER,
 checked_at INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at INTEGER NOT NULL
);
