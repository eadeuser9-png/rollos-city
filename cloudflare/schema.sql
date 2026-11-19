-- Run once when creating your Cloudflare D1 database.
CREATE TABLE IF NOT EXISTS world_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  stamp TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS forum_posts_created_idx ON forum_posts(created_at);

-- Protected purchase proposals. Neither approval nor any endpoint charges real money.
-- No credit cards, bank credentials, or processor tokens should be stored here.
CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor TEXT NOT NULL,
  item TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  requested_at INTEGER NOT NULL,
  approved_at INTEGER,
  budget_month TEXT
);
CREATE INDEX IF NOT EXISTS purchase_requests_budget_idx ON purchase_requests(budget_month,status);
