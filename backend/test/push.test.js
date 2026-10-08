const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Expo } = require('expo-server-sdk');
const { openDatabase } = require('../src/database');
const { createPushService } = require('../src/push');

test('push delivery targets subscribers, records receipts, and prunes invalid devices', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  db.exec(`
    INSERT INTO users VALUES (1, 'subscribed', 'unused'), (2, 'other', 'unused');
    INSERT INTO subscriptions VALUES (1, 1), (2, 2);
    INSERT INTO push_tokens VALUES ('ExpoPushToken[good]', 1), ('ExpoPushToken[bad]', 1), ('ExpoPushToken[other]', 2);
  `);
  t.mock.method(Expo.prototype, 'sendPushNotificationsAsync', async messages => {
    assert.equal(messages.length, 2);
    assert.deepEqual(messages.map(m => m.to).sort(), ['ExpoPushToken[bad]', 'ExpoPushToken[good]']);
    assert.equal(messages[0].data.alarmId, 1);
    return messages.map(message => message.to === 'ExpoPushToken[bad]'
      ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
      : { status: 'ok', id: 'receipt-1' });
  });
  const service = createPushService(db);
  assert.deepEqual(await service.sendAlarm({ id: 1, name: 'Alarm', description: 'Test' }), { sent: 1, failed: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM push_tokens').get().count, 2);
  db.prepare('UPDATE push_receipts SET created_at = ?').run(Date.now() - 16 * 60_000);
  t.mock.method(Expo.prototype, 'getPushNotificationReceiptsAsync', async ids => {
    assert.deepEqual(ids, ['receipt-1']);
    return { 'receipt-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } };
  });
  await service.checkReceipts();
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM push_tokens').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM push_receipts').get().count, 0);
});

test('Expo failures do not throw or claim successful delivery', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  db.exec(`
    INSERT INTO users VALUES (1, 'subscribed', 'unused');
    INSERT INTO subscriptions VALUES (1, 1);
    INSERT INTO push_tokens VALUES ('ExpoPushToken[good]', 1);
  `);
  t.mock.method(Expo.prototype, 'sendPushNotificationsAsync', async () => { throw new Error('Offline'); });
  assert.deepEqual(await createPushService(db).sendAlarm({ id: 1, name: 'Alarm', description: 'Test' }),
    { sent: 0, failed: 1 });
});
