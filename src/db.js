/**
 * MORA HOME — database layer.
 * SQLite (WASM build via sql.js) with automatic file persistence to data/mora.db.
 * The whole data-access layer goes through the small helpers below (all/get/run),
 * so swapping to PostgreSQL later only means re-implementing these three helpers
 * with pg pools — every query in the app already uses standard SQL.
 */
const fs = require('fs');
const path = require('path');
const initSqlite = require('sql.js');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'mora.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

for (const d of [DATA_DIR, UPLOAD_DIR, path.join(UPLOAD_DIR, 'brand'), path.join(UPLOAD_DIR, 'products'), path.join(UPLOAD_DIR, 'pages'), path.join(UPLOAD_DIR, 'categories'), BACKUP_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

let db = null;
let SQL = null;
let persistTimer = null;

function persist(now = false) {
  const write = () => {
    if (!db) return;
    try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); } catch (e) { console.error('[db] persist failed', e.message); }
  };
  if (now) { clearTimeout(persistTimer); write(); return; }
  clearTimeout(persistTimer);
  persistTimer = setTimeout(write, 250);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  live  TEXT NOT NULL DEFAULT '{}',
  draft TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  draft_json    TEXT NOT NULL DEFAULT '{}',
  live_json     TEXT NOT NULL DEFAULT '{}',
  draft_visible INTEGER NOT NULL DEFAULT 1,
  live_visible  INTEGER NOT NULL DEFAULT 1,
  draft_order   INTEGER NOT NULL DEFAULT 0,
  live_order    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS categories (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug     TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  image    TEXT NOT NULL DEFAULT '',
  sort     INTEGER NOT NULL DEFAULT 0,
  visible  INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  badge           TEXT NOT NULL DEFAULT '',
  category_slug   TEXT NOT NULL DEFAULT '',
  material        TEXT NOT NULL DEFAULT '',
  size            TEXT NOT NULL DEFAULT '',
  moq             TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  specs_json      TEXT NOT NULL DEFAULT '[]',
  price_on_request INTEGER NOT NULL DEFAULT 1,
  featured        INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'published',
  demo            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  path       TEXT NOT NULL,
  focal_x    REAL NOT NULL DEFAULT 0.5,
  focal_y    REAL NOT NULL DEFAULT 0.5,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL DEFAULT 'enquiry',
  name       TEXT NOT NULL DEFAULT '',
  company    TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  source     TEXT NOT NULL DEFAULT 'website',
  status     TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lead_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    INTEGER NOT NULL,
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
`;

async function open() {
  SQL = await initSqlite({ locateFile: (f) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f) });
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON;');
  db.run(SCHEMA);
  persist(true);
  return db;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    return out;
  } finally { stmt.free(); }
}
function get(sql, params = []) { return all(sql, params)[0] || null; }
function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const row = get('SELECT last_insert_rowid() AS id');
  persist();
  return { changes, lastInsertRowid: row ? row.id : 0 };
}
function exec(sql) { db.run(sql); persist(); }

/* ---------- settings helpers (JSON values with live/draft) ---------- */
function getSetting(key, mode = 'live') {
  const row = get('SELECT live, draft FROM settings WHERE key = ?', [key]);
  if (!row) return null;
  try { return JSON.parse(row[mode] || row.live || 'null'); } catch { return null; }
}
function setSettingDraft(key, value) {
  const exists = get('SELECT key FROM settings WHERE key = ?', [key]);
  const v = JSON.stringify(value);
  if (exists) run('UPDATE settings SET draft = ? WHERE key = ?', [v, key]);
  else run('INSERT INTO settings (key, live, draft) VALUES (?, ?, ?)', [key, v, v]);
}
function setSettingBoth(key, value) {
  const v = JSON.stringify(value);
  const exists = get('SELECT key FROM settings WHERE key = ?', [key]);
  if (exists) run('UPDATE settings SET live = ?, draft = ? WHERE key = ?', [v, v, key]);
  else run('INSERT INTO settings (key, live, draft) VALUES (?, ?, ?)', [key, v, v]);
}
function publishSetting(key) {
  run('UPDATE settings SET live = draft WHERE key = ?', [key]);
}
function revertSetting(key) {
  run('UPDATE settings SET draft = live WHERE key = ?', [key]);
}

/** Re-open the database from disk (used after a 1-click restore). */
function reload() {
  persist(true);
  if (db) { try { db.close(); } catch { /* noop */ } }
  db = new SQL.Database(fs.readFileSync(DB_PATH));
  return true;
}

module.exports = {
  open, all, get, run, exec, persist, reload,
  getSetting, setSettingDraft, setSettingBoth, publishSetting, revertSetting,
  paths: { DATA_DIR, DB_PATH, UPLOAD_DIR, BACKUP_DIR },
  raw: () => db,
};
