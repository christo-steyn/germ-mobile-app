const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alarms (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      alarm_id INTEGER NOT NULL REFERENCES alarms(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, alarm_id)
    );
    CREATE TABLE IF NOT EXISTS push_tokens (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS push_receipts (
      id TEXT PRIMARY KEY, token TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  if (!db.prepare('PRAGMA table_info(push_tokens)').all().some(column => column.name === 'expires_at')) {
    db.exec('ALTER TABLE push_tokens ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0');
  }
  const insert = db.prepare('INSERT OR IGNORE INTO alarms (id, name, description, updated_at) VALUES (?, ?, ?, ?)');
  const now = new Date().toISOString();
  insert.run(1, 'Main entrance', 'Alarm at the main entrance', now);
  insert.run(2, 'Equipment room', 'Equipment room monitoring alarm', now);
  insert.run(3, 'Temperature warning', 'High temperature detected', now);
  return db;
}

function alarmJson(row) {
  return {
    id: row.id, name: row.name, description: row.description,
    active: Boolean(row.active), updatedAt: row.updated_at,
  };
}

module.exports = { openDatabase, alarmJson };
