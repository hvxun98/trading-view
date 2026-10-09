-- Bảng cho Cloudflare D1: npm run db:init (từ xa) hoặc npm run db:init:local
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  side TEXT NOT NULL,
  level TEXT NOT NULL,
  score REAL NOT NULL,
  total REAL NOT NULL,
  bar_time INTEGER NOT NULL,
  entry REAL,
  sl REAL,
  tp TEXT,
  checks TEXT,
  source TEXT,
  channels TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS alerts_lookup ON alerts (strategy, symbol, side, created_at);
CREATE INDEX IF NOT EXISTS alerts_recent ON alerts (created_at);
