const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let db;

async function query(sql, params = []) {
  if (db.raw) {
    const r = await db.raw.query(sql, params);
    return r;
  }
  return { rows: db.prepare(sql).all(...params), rowCount: 0 };
}

async function queryOne(sql, params = []) {
  if (db.raw) {
    const r = await db.raw.query(sql, params);
    return r.rows[0];
  }
  return db.prepare(sql).get(...params);
}

async function execute(sql, params = []) {
  if (db.raw) {
    await db.raw.query(sql, params);
    return { lastInsertRowid: 0 };
  }
  return db.prepare(sql).run(...params);
}

async function runMany(sqls) {
  for (const s of sqls) {
    if (db.raw) {
      try { await db.raw.query(s); } catch {}
    } else {
      try { db.exec(s); } catch {}
    }
  }
}

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  db = { raw: pool };
} else {
  const Database = require('better-sqlite3');
  const DB_PATH = process.env.DB_PATH || './data/database.sqlite';
  db = new Database(path.resolve(__dirname, '../../', DB_PATH));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
}

async function initialize() {
  if (process.env.DATABASE_URL) {
    const sqls = [
      `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', is_active INTEGER DEFAULT 1, subscription_ends TEXT, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), last_login TEXT)`,
      `CREATE TABLE IF NOT EXISTS accounts (id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, token TEXT, api_id TEXT, api_hash TEXT, session_string TEXT, phone TEXT, is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'disconnected', last_used TEXT, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), user_id INTEGER REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS channels (id SERIAL PRIMARY KEY, username TEXT NOT NULL, title TEXT, type TEXT DEFAULT 'public', members INTEGER DEFAULT 0, photo TEXT, is_verified INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, last_publish TEXT, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, content TEXT, msg_type TEXT DEFAULT 'text', file_path TEXT, media_group_id TEXT, buttons TEXT, parse_mode TEXT DEFAULT 'HTML', status TEXT DEFAULT 'draft', sent_at TEXT, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), channel_id INTEGER REFERENCES channels(id), account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS schedules (id SERIAL PRIMARY KEY, frequency TEXT NOT NULL, cron_expr TEXT, specific_date TEXT, specific_days TEXT, is_active INTEGER DEFAULT 1, last_run TEXT, next_run TEXT, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), message_id INTEGER REFERENCES messages(id), channel_id INTEGER REFERENCES channels(id), account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS publish_logs (id SERIAL PRIMARY KEY, action TEXT NOT NULL, status TEXT NOT NULL, details TEXT, error TEXT, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), channel_id INTEGER REFERENCES channels(id), account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, ip TEXT, device TEXT, status TEXT, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), user_id INTEGER REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS backups (id SERIAL PRIMARY KEY, filename TEXT NOT NULL, size INTEGER DEFAULT 0, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
    ];
    await runMany(sqls);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', is_active INTEGER DEFAULT 1, subscription_ends TEXT, created_at TEXT DEFAULT (datetime('now')), last_login TEXT);
      CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, token TEXT, api_id TEXT, api_hash TEXT, session_string TEXT, phone TEXT, is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'disconnected', last_used TEXT, created_at TEXT DEFAULT (datetime('now')), user_id INTEGER REFERENCES users(id));
      CREATE TABLE IF NOT EXISTS channels (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, title TEXT, type TEXT DEFAULT 'public', members INTEGER DEFAULT 0, photo TEXT, is_verified INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, last_publish TEXT, created_at TEXT DEFAULT (datetime('now')), account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id));
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, msg_type TEXT DEFAULT 'text', file_path TEXT, media_group_id TEXT, buttons TEXT, parse_mode TEXT DEFAULT 'HTML', status TEXT DEFAULT 'draft', sent_at TEXT, created_at TEXT DEFAULT (datetime('now')), channel_id INTEGER REFERENCES channels(id), account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id));
      CREATE TABLE IF NOT EXISTS schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, frequency TEXT NOT NULL, cron_expr TEXT, specific_date TEXT, specific_days TEXT, is_active INTEGER DEFAULT 1, last_run TEXT, next_run TEXT, created_at TEXT DEFAULT (datetime('now')), message_id INTEGER REFERENCES messages(id), channel_id INTEGER REFERENCES channels(id), account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id));
      CREATE TABLE IF NOT EXISTS publish_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, status TEXT NOT NULL, details TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), channel_id INTEGER REFERENCES channels(id), account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id));
      CREATE TABLE IF NOT EXISTS login_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT, device TEXT, status TEXT, created_at TEXT DEFAULT (datetime('now')), user_id INTEGER REFERENCES users(id));
      CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, size INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    `);
  }

  const admin = await queryOne('SELECT id FROM users WHERE username = $1', [process.env.ADMIN_USERNAME || '𖤐 𝕬𝖇𝖞𝖘𝖘 𖤐']);
  if (!admin) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'VT_YC', 10);
    await execute('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [process.env.ADMIN_USERNAME || '𖤐 𝕬𝖇𝖞𝖘𝖘 𖤐', hash, 'admin']);
  }

  const defaults = [['aes_encryption', 'true'], ['device_logging', 'true'], ['login_history', 'true'], ['two_factor', 'false'], ['captcha', 'true'], ['rate_limit', 'true'], ['auto_backup', 'true']];
  for (const [k, v] of defaults) {
    try {
      const exists = await queryOne('SELECT key FROM settings WHERE key = $1', [k]);
      if (!exists) await execute('INSERT INTO settings (key, value) VALUES ($1, $2)', [k, v]);
    } catch {}
  }
}

module.exports = { db, query, queryOne, execute, runMany, initialize };
