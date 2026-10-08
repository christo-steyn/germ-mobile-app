const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { openDatabase } = require('../src/database');

const secret = randomBytes(32).toString('hex');
const adminKey = randomBytes(32).toString('hex');
const db = openDatabase(':memory:');
let server;
let baseUrl;
let alice;
let bob;
const delivered = [];

before(async () => {
  const app = createApp({
    db, jwtSecret: secret, adminKey,
    pushService: { sendAlarm: async alarm => {
      delivered.push(alarm);
      return { sent: 1, failed: 0 };
    } },
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
});

async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: ['Bearer', token].join(' ') } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

test('configuration refuses missing, weak, or shared secrets', () => {
  assert.throws(() => createApp({ db }), /JWT_SECRET/);
  assert.throws(() => createApp({ db, jwtSecret: 'short' }), /JWT_SECRET/);
  assert.throws(() => createApp({ db, jwtSecret: secret, adminKey: secret }), /ALARM_ADMIN_KEY/);
});

test('register and login validate credentials and never return password hashes', async () => {
  assert.equal((await request('/api/auth/register', { method: 'POST', body: { username: 'a', password: 'short' } })).status, 400);
  const registered = await request('/api/auth/register', {
    method: 'POST', body: { username: 'Alice', password: 'long-password' },
  });
  assert.equal(registered.status, 201);
  assert.deepEqual(registered.body.user, { id: 1, username: 'alice' });
  alice = registered.body.token;
  const stored = db.prepare('SELECT password_hash FROM users WHERE id = 1').get().password_hash;
  assert.notEqual(stored, 'long-password');
  assert.match(stored, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal((await request('/api/auth/register', {
    method: 'POST', body: { username: 'ALICE', password: 'long-password' },
  })).status, 409);
  for (const username of ['alice', 'missing']) {
    assert.equal((await request('/api/auth/login', {
      method: 'POST', body: { username, password: 'wrong-password' },
    })).status, 401);
  }
  const login = await request('/api/auth/login', {
    method: 'POST', body: { username: 'Alice', password: 'long-password' },
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  const other = await request('/api/auth/register', {
    method: 'POST', body: { username: 'bob', password: 'other-password' },
  });
  bob = other.body.token;
});

test('protected API rejects missing, tampered and expired JWTs', async () => {
  assert.equal((await request('/api/alarms')).status, 401);
  assert.equal((await request('/api/alarms', { token: `${alice}tampered` })).status, 401);
  const expired = jwt.sign({}, secret, {
    subject: '1', expiresIn: -1, issuer: 'germ-api', audience: 'germ-mobile',
  });
  assert.equal((await request('/api/auth/me', { token: expired })).status, 401);
  assert.deepEqual((await request('/api/auth/me', { token: alice })).body.user, { id: 1, username: 'alice' });
});

test('subscriptions are idempotent, validated and scoped to the current user', async () => {
  const alarms = await request('/api/alarms', { token: alice });
  assert.equal(alarms.body.alarms.length, 3);
  assert.equal(alarms.body.alarms[0].active, false);
  for (const alarmId of [null, '1', -1, 1.5]) {
    assert.equal((await request('/api/subscriptions', {
      token: alice, method: 'POST', body: { alarmId },
    })).status, 400);
  }
  assert.equal((await request('/api/subscriptions', {
    token: alice, method: 'POST', body: { alarmId: 99 },
  })).status, 404);
  for (let i = 0; i < 2; i++) {
    assert.equal((await request('/api/subscriptions', {
      token: alice, method: 'POST', body: { alarmId: 1 },
    })).status, 201);
  }
  assert.equal((await request('/api/subscriptions', { token: alice })).body.subscriptions.length, 1);
  assert.equal((await request('/api/subscriptions', { token: bob })).body.subscriptions.length, 0);
  assert.equal((await request('/api/subscriptions/1', { token: bob, method: 'DELETE' })).status, 204);
  assert.equal((await request('/api/subscriptions', { token: alice })).body.subscriptions.length, 1);
  assert.equal((await request('/api/subscriptions/1junk', { token: alice, method: 'DELETE' })).status, 400);
  assert.equal((await request('/api/subscriptions/1', { token: alice, method: 'DELETE' })).status, 204);
  assert.equal((await request('/api/subscriptions', { token: alice })).body.subscriptions.length, 0);
});

test('push tokens validate format, transfer accounts, and cannot be deleted by another user', async () => {
  assert.equal((await request('/api/push-tokens', {
    token: alice, method: 'POST', body: { token: 'invalid' },
  })).status, 400);
  const pushToken = `ExpoPushToken[${randomBytes(16).toString('hex')}]`;
  for (const token of [alice, bob]) {
    assert.equal((await request('/api/push-tokens', {
      token, method: 'POST', body: { token: pushToken },
    })).status, 204);
  }
  assert.equal(db.prepare('SELECT user_id FROM push_tokens WHERE token = ?').get(pushToken).user_id, 2);
  assert.equal(db.prepare('SELECT expires_at FROM push_tokens WHERE token = ?').get(pushToken).expires_at,
    jwt.decode(bob).exp * 1000);
  await request('/api/push-tokens', { token: alice, method: 'DELETE', body: { token: pushToken } });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM push_tokens').get().count, 1);
  await request('/api/push-tokens', { token: bob, method: 'DELETE', body: { token: pushToken } });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM push_tokens').get().count, 0);
});

test('only admin can activate alarms and push is sent only on inactive-to-active transitions', async () => {
  const path = '/api/admin/alarms/1';
  assert.equal((await request(path, { token: alice, method: 'PATCH', body: { active: true } })).status, 403);
  const headers = { 'x-alarm-admin-key': adminKey };
  assert.equal((await request(path, { method: 'PATCH', headers, body: { active: 'true' } })).status, 400);
  const active = await request(path, { method: 'PATCH', headers, body: { active: true } });
  assert.equal(active.status, 200);
  assert.equal(active.body.alarm.active, true);
  assert.equal(active.body.notifications.sent, 1);
  await request(path, { method: 'PATCH', headers, body: { active: true } });
  assert.equal(delivered.length, 1);
  await request(path, { method: 'PATCH', headers, body: { active: false } });
  await request(path, { method: 'PATCH', headers, body: { active: true } });
  assert.equal(delivered.length, 2);
});

test('bad JSON and unknown endpoints return safe JSON errors', async () => {
  const invalid = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'Invalid JSON.' });
  assert.equal((await request('/api/not-found')).status, 404);
});

test('authentication rate limits use JSON errors and disable response caching', async () => {
  let result;
  for (let i = 0; i < 21; i++) {
    result = await request('/api/auth/login', { method: 'POST', body: {} });
  }
  assert.equal(result.status, 429);
  assert.match(result.body.error, /Too many requests/);
  const response = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
