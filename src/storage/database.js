import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '..', '..', 'data', 'database.sqlite');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_id TEXT NOT NULL,
  paket_code TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  jamaah_hash TEXT NOT NULL,
  jamaah_count INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(spreadsheet_id, paket_code, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
  ON snapshots(spreadsheet_id, paket_code, snapshot_date);

CREATE TABLE IF NOT EXISTS sent_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_id TEXT NOT NULL,
  paket_code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  sent_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(spreadsheet_id, paket_code, report_date)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  spreadsheets_total INTEGER DEFAULT 0,
  spreadsheets_done INTEGER DEFAULT 0,
  pakets_total INTEGER DEFAULT 0,
  pakets_done INTEGER DEFAULT 0,
  pakets_failed INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now','localtime')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS spreadsheet_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_run_id INTEGER NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paket_count INTEGER DEFAULT 0,
  paket_done INTEGER DEFAULT 0,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id)
);

CREATE TABLE IF NOT EXISTS paket_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_run_id INTEGER NOT NULL,
  paket_code TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (spreadsheet_run_id) REFERENCES spreadsheet_runs(id)
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function initDatabase() {
  if (db) return db;

  mkdirSync(resolve(DB_PATH, '..'), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  logger.info('[db] database initialized');
  return db;
}

export function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('[db] database closed');
  }
}
