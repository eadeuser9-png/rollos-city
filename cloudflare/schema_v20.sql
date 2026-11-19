-- V20 additive print workflow. Does not alter world state or old shop tables.
CREATE TABLE IF NOT EXISTS print_products (
  creation_id INTEGER PRIMARY KEY REFERENCES rollo_creations(id),
  file_width INTEGER, file_height INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  printful_product_id TEXT UNIQUE,
  stripe_product_id TEXT UNIQUE,
  stripe_price_id TEXT UNIQUE,
  error TEXT, updated_at INTEGER NOT NULL
);
