const sqlite3 = require('sqlite3');
const fs = require('node:fs/promises');
const path = require('node:path');

async function openDatabase(filename) {
  if (filename !== ':memory:') await fs.mkdir(path.dirname(filename), { recursive: true });
  const connection = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename, error => error ? reject(error) : resolve(database));
  });
  const db = {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        connection.run(sql, params, function (error) {
          if (error) reject(error);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => connection.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => connection.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
    },
    exec(sql) {
      return new Promise((resolve, reject) => connection.exec(sql, error => error ? reject(error) : resolve()));
    },
    close() {
      return new Promise((resolve, reject) => connection.close(error => error ? reject(error) : resolve()));
    },
  };
  await db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS alarms (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      alarm_id INTEGER NOT NULL REFERENCES alarms(id) ON DELETE CASCADE,
      subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, alarm_id)
    );
    CREATE TABLE IF NOT EXISTS push_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS subscriptions_alarm ON subscriptions(alarm_id);
    CREATE TABLE IF NOT EXISTS push_receipts (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      token_updated_at TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      due_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  const subscriptionColumns = await db.all('PRAGMA table_info(subscriptions)');
  if (subscriptionColumns.some(column => column.name === 'created_at') &&
      !subscriptionColumns.some(column => column.name === 'subscribed_at')) {
    await db.exec('ALTER TABLE subscriptions RENAME COLUMN created_at TO subscribed_at');
  }
  return db;
}

module.exports = { openDatabase };
