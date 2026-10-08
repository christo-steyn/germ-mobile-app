const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openDatabase } = require('../src/database');

test('older device registrations migrate safely and database records survive reopening', t => {
  const directory = mkdtempSync(join(tmpdir(), 'germ-db-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'test.db');
  const old = new DatabaseSync(filename);
  old.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
    INSERT INTO users VALUES (1, 'existing', 'stored-hash');
    CREATE TABLE push_tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id));
    INSERT INTO push_tokens VALUES ('ExpoPushToken[old]', 1);
  `);
  old.close();
  const migrated = openDatabase(filename);
  assert.equal(migrated.prepare('SELECT expires_at FROM push_tokens').get().expires_at, 0);
  assert.equal(migrated.prepare('SELECT username FROM users WHERE id = 1').get().username, 'existing');
  migrated.close();
  const reopened = openDatabase(filename);
  try {
    assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM alarms').get().count, 3);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
  } finally {
    reopened.close();
  }
});
