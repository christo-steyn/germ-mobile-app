const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { createApp } = require('../server');
const { readConfig, resolveDatabasePath } = require('../config');
const { openDatabase } = require('../models/database');

let app;
let server;
let base;
let directory;
let alice;
let bob;
let alarm;
const sent = [];
let sendMode = 'ok';
let receiptMode = 'ok';
const secret = randomBytes(48).toString('hex');
const expo = {
  chunkPushNotifications: messages => messages.length ? [messages] : [],
  chunkPushNotificationReceiptIds: ids => ids.length ? [ids] : [],
  sendPushNotificationsAsync: async messages => {
    sent.push(...messages);
    if (sendMode === 'throw') throw new Error('Sensitive upstream details');
    return messages.map(() => sendMode === 'device'
      ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
      : { status: 'ok', id: randomUUID() });
  },
  getPushNotificationReceiptsAsync: async ids => {
    if (receiptMode === 'throw') throw new Error('Sensitive upstream receipt details');
    if (receiptMode === 'pending') return {};
    return Object.fromEntries(ids.map(id => [id, receiptMode === 'device'
      ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }]));
  },
};
async function request(route, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, {
    method, headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: ['Bearer', token].join(' ') } : {}), ...headers,
    }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const content = await response.text();
  return { status: response.status, data: content ? JSON.parse(content) : null, headers: response.headers };
}
async function register(username) {
  const result = await request('/auth/register', {
    method: 'POST', body: { username, email: `${username}@example.test`, password: 'TestPassword123!' },
  });
  assert.equal(result.status, 201);
  return result.data;
}
const pushA = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const pushB = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const tokenRequest = (token, owner, method = 'POST') => request('/api/notifications/token', {
  method, token: owner.token, body: { token },
});
const send = body => request('/api/notifications/send', {
  method: 'POST', token: alice.token, body: { alarmId: alarm.id, ...body },
});

before(async () => {
  directory = path.join(__dirname, '..', '.test-data', randomUUID());
  await fs.mkdir(directory, { recursive: true });
  const config = readConfig({
    JWT_SECRET: secret, DB_PATH: path.join(directory, 'test.sqlite'),
    ENABLE_TEST_ENDPOINTS: 'true', CORS_ORIGINS: 'http://localhost:8081',
  });
  app = await createApp({ config, expo, receiptDelayMs: 0 });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (app) await app.locals.db.close();
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

test('configuration requires secret material and explicit CORS origins', () => {
  assert.throws(() => readConfig({}), /JWT_SECRET/);
  assert.throws(() => readConfig({ JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => readConfig({ JWT_SECRET: secret, PORT: 'NaN' }), /PORT/);
  assert.throws(() => readConfig({ JWT_SECRET: secret, CORS_ORIGINS: '*' }), /CORS/);
  assert.equal(readConfig({ JWT_SECRET: secret, NODE_ENV: 'production', ENABLE_TEST_ENDPOINTS: 'true' }).testEndpoints, false);
  assert.equal(resolveDatabasePath({}), path.join(__dirname, '..', 'data', 'germ.sqlite'));
  assert.equal(resolveDatabasePath({ DB_PATH: 'data/custom.sqlite' }), path.join(__dirname, '..', 'data', 'custom.sqlite'));
  assert.equal(resolveDatabasePath({ DB_PATH: ':memory:' }), ':memory:');
});
test('health, JSON errors, security headers and CORS', async () => {
  const health = await request('/health', { headers: { origin: 'http://localhost:8081' } });
  assert.equal(health.status, 200);
  assert.equal(health.data.status, 'ok');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  assert.equal((await request('/health', { headers: { origin: 'https://untrusted.test' } })).headers.get('access-control-allow-origin'), null);
  const bad = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'Invalid JSON');
  assert.equal((await request('/unknown')).status, 404);
});
test('registration and login return safe profiles and reject duplicates or invalid data', async () => {
  alice = await register('alice');
  bob = await register('bob');
  assert.deepEqual(Object.keys(alice.user).sort(), ['createdAt', 'email', 'id', 'username']);
  for (const body of [
    { username: 'alice', email: 'new@example.test', password: 'TestPassword123!' },
    { username: 'newuser', email: 'ALICE@example.test', password: 'TestPassword123!' },
  ]) assert.equal((await request('/auth/register', { method: 'POST', body })).status, 409);
  for (const body of [
    { username: 'invalid space', email: 'x@example.test', password: 'TestPassword123!' },
    { username: 'valid', email: 'bad', password: 'TestPassword123!' },
    { username: 'valid', email: 'x@example.test', password: 'short' },
    { username: 'valid', email: 'x@example.test', password: 'é'.repeat(37) },
    { username: 'valid', email: 'x@example.test', password: 'TestPassword123!', role: 'admin' },
  ]) assert.equal((await request('/auth/register', { method: 'POST', body })).status, 400);
  const login = await request('/auth/login', { method: 'POST', body: { username: 'ALICE', password: 'TestPassword123!' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.id, alice.user.id);
  assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'alice', password: 'wrong-password' } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { username: "' OR 1=1 --", password: 'TestPassword123!' } })).status, 401);
  const row = await app.locals.db.get('SELECT password_hash FROM users WHERE id = ?', [alice.user.id]);
  assert.match(row.password_hash, /^\$2[ab]\$12\$/);
});
test('authentication rejects missing, expired, no-expiry, wrong-algorithm and wrong-audience JWTs', async () => {
  assert.equal((await request('/api/user/profile')).status, 401);
  const claims = { subject: String(alice.user.id), issuer: 'germ-api', audience: 'germ-mobile' };
  for (const token of [
    'invalid', jwt.sign({}, secret, { ...claims, expiresIn: -1 }),
    jwt.sign({}, secret, claims),
    jwt.sign({}, secret, { ...claims, algorithm: 'HS384', expiresIn: '1h' }),
    jwt.sign({}, secret, { ...claims, audience: 'other', expiresIn: '1h' }),
    jwt.sign({}, randomBytes(48), { ...claims, expiresIn: '1h' }),
  ]) assert.equal((await request('/api/user/profile', { token })).status, 401);
  const profile = await request('/api/user/profile', { token: alice.token });
  assert.equal(profile.status, 200);
  assert.deepEqual(profile.data.user, alice.user);
  for (const authorization of [
    ['Bearer', '', alice.token].join(' '),
    ['Basic', alice.token].join(' '),
    ['Bearer', alice.token, 'extra'].join(' '),
  ]) {
    assert.equal((await request('/api/user/profile', { headers: { authorization } })).status, 401);
  }
});
test('alarm validation, reads and idempotent user-isolated nested subscriptions', async () => {
  const created = await request('/api/alarms', {
    method: 'POST', token: alice.token, body: { name: 'Storm', description: 'Seek shelter', severity: 'high' },
  });
  assert.equal(created.status, 201);
  alarm = created.data.alarm;
  assert.equal((await request('/api/alarms', { token: bob.token })).data.alarms.length, 1);
  assert.deepEqual((await request(`/api/alarms/${alarm.id}`, { token: bob.token })).data.alarm, alarm);
  assert.equal((await request('/api/alarms/9999', { token: alice.token })).status, 404);
  assert.equal((await request('/api/alarms/1 OR 1=1', { token: alice.token })).status, 400);
  assert.equal((await request('/api/alarms', { method: 'POST', token: alice.token, body: { name: 'bad', description: 'bad', severity: 'extreme' } })).status, 400);
  const subscription = () => request('/api/subscriptions', { method: 'POST', token: alice.token, body: { alarmId: alarm.id } });
  assert.equal((await subscription()).status, 201);
  assert.equal((await subscription()).status, 200);
  const list = await request('/api/subscriptions', { token: alice.token });
  assert.equal(list.data.subscriptions.length, 1);
  assert.deepEqual(list.data.subscriptions[0].alarm, alarm);
  assert.equal((await request('/api/subscriptions', { token: bob.token })).data.subscriptions.length, 0);
  assert.equal((await request('/api/subscriptions', { method: 'POST', token: alice.token, body: { alarmId: 999 } })).status, 404);
  for (const alarmId of [[alarm.id], null, 0, -1, 1.5, {}, '1 OR 1=1']) {
    assert.equal((await request('/api/subscriptions', { method: 'POST', token: alice.token, body: { alarmId } })).status, 400);
  }
  assert.equal((await request(`/api/subscriptions/${alarm.id}`, { method: 'DELETE', token: bob.token })).status, 204);
  assert.equal((await request('/api/subscriptions', { token: alice.token })).data.subscriptions.length, 1);
});
test('Expo token validation, subscription filtering, deduplication and ownership transfer', async () => {
  assert.equal((await tokenRequest('arbitrary-token', alice)).status, 400);
  assert.equal((await tokenRequest(pushA, alice)).status, 200);
  assert.equal((await tokenRequest(pushA, alice)).status, 200);
  assert.equal((await tokenRequest(pushB, bob)).status, 200);
  const result = await send({});
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.notification, { alarmId: alarm.id, recipients: 1, accepted: 1, failed: 0 });
  assert.equal(sent.at(-1).to, pushA);
  assert.equal(sent.at(-1).channelId, 'alarms');
  assert.equal(sent.at(-1).data.alarmId, alarm.id);
  assert.equal(sent.at(-1).data.userId, alice.user.id);
  assert.equal((await send({ token: pushB })).status, 400);
  await tokenRequest(pushA, bob);
  await tokenRequest(pushA, alice, 'DELETE');
  assert.equal((await app.locals.db.get('SELECT user_id FROM push_tokens WHERE token = ?', [pushA])).user_id, bob.user.id);
  assert.equal((await send({})).data.notification.recipients, 0);
  await tokenRequest(pushA, alice);
});
test('ticket and receipt errors are sanitized; transient receipts retry and invalid devices removed', async () => {
  sendMode = 'throw';
  const failed = await send({});
  assert.equal(failed.status, 200);
  assert.equal(failed.data.notification.failed, 1);
  assert.equal(JSON.stringify(failed.data).includes('Sensitive'), false);
  sendMode = 'device';
  assert.equal((await send({})).data.notification.failed, 1);
  assert.equal(await app.locals.db.get('SELECT token FROM push_tokens WHERE token = ?', [pushA]), undefined);
  sendMode = 'ok';
  await tokenRequest(pushA, alice);
  await send({});
  receiptMode = 'throw';
  await app.locals.processReceipts();
  assert.ok((await app.locals.db.get('SELECT COUNT(*) AS total FROM push_receipts')).total > 0);
  receiptMode = 'pending';
  await app.locals.processReceipts();
  assert.ok((await app.locals.db.get('SELECT COUNT(*) AS total FROM push_receipts')).total > 0);
  receiptMode = 'device';
  await app.locals.processReceipts();
  assert.equal(await app.locals.db.get('SELECT token FROM push_tokens WHERE token = ?', [pushA]), undefined);
  assert.equal((await app.locals.db.get('SELECT COUNT(*) AS total FROM push_receipts')).total, 0);
});
test('stale receipts cannot delete transferred tokens; owned logout stops delivery', async () => {
  receiptMode = 'ok';
  await tokenRequest(pushA, alice);
  await send({});
  await tokenRequest(pushA, bob);
  receiptMode = 'device';
  await app.locals.processReceipts();
  assert.equal((await app.locals.db.get('SELECT user_id FROM push_tokens WHERE token = ?', [pushA])).user_id, bob.user.id);
  await tokenRequest(pushA, alice);
  await tokenRequest(pushA, alice, 'DELETE');
  await request(`/api/subscriptions/${alarm.id}`, { method: 'DELETE', token: alice.token });
  assert.equal((await request('/api/subscriptions', { token: alice.token })).data.subscriptions.length, 0);
});
test('SQLite foreign keys reject orphaned subscriptions', async () => {
  assert.equal((await app.locals.db.get('PRAGMA foreign_keys')).foreign_keys, 1);
  await assert.rejects(app.locals.db.run('INSERT INTO subscriptions (user_id, alarm_id) VALUES (?, ?)', [999, alarm.id]), /FOREIGN KEY/);
  const columns = await app.locals.db.all('PRAGMA table_info(subscriptions)');
  assert.ok(columns.some(column => column.name === 'subscribed_at'));
  assert.ok(!columns.some(column => column.name === 'created_at'));
});
test('legacy subscription timestamp column migrates without losing rows', async () => {
  const filename = path.join(directory, 'migration.sqlite');
  let database = await openDatabase(filename);
  try {
    await database.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', ['legacy', 'legacy@example.test', 'unused-test-hash']);
    await database.run('INSERT INTO alarms (name, description, severity) VALUES (?, ?, ?)', ['Legacy', 'Legacy alarm', 'low']);
    await database.run('INSERT INTO subscriptions (user_id, alarm_id) VALUES (?, ?)', [1, 1]);
    const original = await database.get('SELECT subscribed_at FROM subscriptions WHERE id = 1');
    await database.exec('ALTER TABLE subscriptions RENAME COLUMN subscribed_at TO created_at');
    await database.close();
    database = await openDatabase(filename);
    const migrated = await database.get('SELECT subscribed_at FROM subscriptions WHERE id = 1');
    assert.equal(migrated.subscribed_at, original.subscribed_at);
  } finally {
    await database.close();
  }
});
test('alarm and subscription lists return all records beyond 500 without truncation', async () => {
  const db = app.locals.db;
  await db.exec('BEGIN');
  try {
    for (let i = 0; i < 505; i++) {
      const inserted = await db.run('INSERT INTO alarms (name, description, severity) VALUES (?, ?, ?)',
        [`Bulk alarm ${i}`, 'List completeness regression', 'low']);
      await db.run('INSERT INTO subscriptions (user_id, alarm_id) VALUES (?, ?)', [bob.user.id, inserted.lastID]);
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  const total = await db.get('SELECT COUNT(*) AS total FROM alarms');
  const allAlarms = await request('/api/alarms', { token: alice.token });
  assert.equal(allAlarms.status, 200);
  assert.equal(allAlarms.data.alarms.length, total.total);
  assert.ok(allAlarms.data.alarms.length > 500);
  const subscriptions = await request('/api/subscriptions', { token: bob.token });
  assert.equal(subscriptions.status, 200);
  assert.equal(subscriptions.data.subscriptions.length, 505);
  assert.ok(subscriptions.data.subscriptions.every(subscription => subscription.alarm && subscription.createdAt));
});
test('production testing endpoints stay disabled even when manually configured true', async () => {
  const production = await createApp({
    db: app.locals.db, expo,
    config: { ...readConfig({ JWT_SECRET: secret }), production: true, testEndpoints: true },
  });
  const listener = production.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  try {
    for (const route of ['/api/alarms', '/api/notifications/send']) {
      const response = await fetch(`http://127.0.0.1:${listener.address().port}${route}`, {
        method: 'POST', headers: { authorization: ['Bearer', alice.token].join(' ') },
      });
      assert.equal(response.status, 404);
    }
  } finally {
    await new Promise(resolve => listener.close(resolve));
  }
});
test('request size and authentication rate limits are enforced', async () => {
  assert.equal((await request('/auth/login', {
    method: 'POST', body: { username: 'alice', password: 'x'.repeat(17000) },
  })).status, 413);
  let result;
  for (let i = 0; i < 21; i++) result = await request('/auth/login', {
    method: 'POST', body: { username: 'alice', password: 'wrong-password' },
  });
  assert.equal(result.status, 429);
  assert.match(result.data.error, /Too many/);
});
