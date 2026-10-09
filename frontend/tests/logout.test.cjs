const test = require('node:test');
const assert = require('node:assert/strict');
const { finishLogout } = require('../api/logout');

test('failed device removal blocks logout without clearing authentication', async () => {
  let cleared = false;
  await assert.rejects(finishLogout({
    isCurrent: () => true,
    getRegistration: () => ({ token: 'test-device' }),
    unregister: async () => { throw new Error('offline'); },
    clearSession: async () => { cleared = true; },
  }), /offline/);
  assert.equal(cleared, false);
});

test('successful logout waits for registration, removes the device, then clears authentication', async () => {
  const steps = [];
  assert.equal(await finishLogout({
    pendingRegistration: Promise.resolve().then(() => steps.push('registered')),
    isCurrent: () => true,
    getRegistration: () => ({ token: 'test-device' }),
    unregister: async () => { steps.push('removed'); },
    clearSession: async () => { steps.push('cleared'); },
  }), true);
  assert.deepEqual(steps, ['registered', 'removed', 'cleared']);
});

test('late registration from an old session cannot unregister or clear a new session', async () => {
  let active = 1;
  let resolveRegistration;
  const work = finishLogout({
    pendingRegistration: new Promise((resolve) => { resolveRegistration = resolve; }),
    isCurrent: () => active === 1,
    getRegistration: () => { throw new Error('old logout reached new session'); },
    unregister: async () => { throw new Error('new device removed'); },
    clearSession: async () => { throw new Error('new auth cleared'); },
  });
  active = 2;
  resolveRegistration();
  assert.equal(await work, false);
});

test('a session changing during device cleanup cannot have its authentication cleared', async () => {
  let active = 1;
  let cleared = false;
  assert.equal(await finishLogout({
    isCurrent: () => active === 1,
    getRegistration: () => ({ token: 'test-device' }),
    unregister: async () => { active = 2; },
    clearSession: async () => { cleared = true; },
  }), false);
  assert.equal(cleared, false);
});
