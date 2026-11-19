-- Additive Rollo V10 migration. Does not delete/reset existing data.
CREATE TABLE IF NOT EXISTS city_places (id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,x REAL NOT NULL,z REAL NOT NULL,w REAL NOT NULL,d REAL NOT NULL,h REAL NOT NULL,description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visitor_posts (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS visitor_photos (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,caption TEXT NOT NULL,object_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS visitor_limits (k TEXT PRIMARY KEY,last_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rollo_creations (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,topic TEXT NOT NULL,svg TEXT NOT NULL,stamp TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_rollo_art_created ON rollo_creations(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_posts_status ON visitor_posts(status,created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_photos_status ON visitor_photos(status,created_at);
