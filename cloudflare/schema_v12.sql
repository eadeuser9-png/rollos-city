-- Rollo V12 additive shop listings. No existing data is altered or removed.
CREATE TABLE IF NOT EXISTS art_listings (
  creation_id INTEGER PRIMARY KEY,
  price_cents INTEGER NOT NULL CHECK(price_cents >= 100 AND price_cents <= 200000),
  checkout_url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('draft','active')) DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(creation_id) REFERENCES rollo_creations(id)
);
CREATE INDEX IF NOT EXISTS idx_art_listings_status ON art_listings(status,updated_at);
