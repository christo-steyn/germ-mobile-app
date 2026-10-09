const test = require('node:test');
const assert = require('node:assert/strict');
const { createApiClient, ApiError } = require('../api/client');

const session = { id: 1, token: 'test-only-value' };
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
const setup = (fetchImpl, overrides = {}) => createApiClient({
  baseUrl: 'https://example.invalid/',
  getSession: () => session,
  onUnauthorized: () => {},
  fetchImpl,
  ...overrides,
});

test('authenticated request injects bearer token and JSON payload', async () => {
  let captured;
  const api = setup(async (url, options) => { captured = { url, options }; return response({ ok: true }); });
  assert.deepEqual(await api('/api/subscriptions', { method: 'POST', body: { alarmId: 3 } }), { ok: true });
  assert.equal(captured.url, 'https://example.invalid/api/subscriptions');
  assert.equal(captured.options.headers.Authorization, ['Bearer', session.token].join(' '));
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(captured.options.body), { alarmId: 3 });
});

test('login does not attach authentication or clear auth on rejected credentials', async () => {
  let unauthorized = false;
  const api = setup(async (_, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return response({ debug: 'sensitive server detail' }, 401);
  }, { onUnauthorized: () => { unauthorized = true; } });
  await assert.rejects(api('/auth/login', { authenticated: false, method: 'POST' }), /Username or password is incorrect/);
  assert.equal(unauthorized, false);
});

test('a late unauthorized response carries the old session, never the new session', async () => {
  let active = session;
  let complete;
  const api = setup(() => new Promise((resolve) => { complete = resolve; }), {
    getSession: () => active,
    onUnauthorized: (captured) => {
      if (captured.id === active.id) active = null;
    },
  });
  const request = api('/api/alarms');
  const next = { id: 2, token: 'another-test-value' };
  active = next;
  complete(response({}, 401));
  await assert.rejects(request, (error) => error.status === 401);
  assert.equal(active, next);
});

test('current session unauthorized errors invoke expiry handler', async () => {
  let captured;
  const api = setup(async () => response({}, 401), { onUnauthorized: (value) => { captured = value; } });
  await assert.rejects(api('/api/user/profile'), /session expired/);
  assert.equal(captured, session);
});

test('sanitizes server and network errors', async () => {
  await assert.rejects(setup(async () => response({ error: 'private stack trace' }, 500))('/api/alarms'),
    (error) => error instanceof ApiError && !error.message.includes('private'));
  await assert.rejects(setup(async () => { throw new Error('private host data'); })('/api/alarms'),
    (error) => error instanceof ApiError && !error.message.includes('private'));
});

test('timeout aborts fetch and provides a retryable message', async () => {
  const api = setup((_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })));
  }), { timeoutMs: 5 });
  await assert.rejects(api('/api/alarms'), /timed out/);
});

test('invalid JSON produces a sanitized response error', async () => {
  const api = setup(async () => ({ ok: true, status: 200, json: async () => { throw new Error('raw response'); } }));
  await assert.rejects(api('/api/alarms'), /invalid response/);
});

test('204 delete response needs no JSON', async () => {
  assert.equal(await setup(async () => response(undefined, 204))('/api/subscriptions/1', { method: 'DELETE' }), null);
});

test('configuration and missing auth fail before fetching', async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; return response({}); };
  await assert.rejects(setup(fetchImpl, { baseUrl: '' })('/api/alarms'), /EXPO_PUBLIC_API_URL/);
  await assert.rejects(setup(fetchImpl, { getSession: () => null })('/api/alarms'), /sign in again/);
  assert.equal(fetched, false);
});
