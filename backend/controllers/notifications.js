const { randomUUID } = require('node:crypto');
const { Expo } = require('expo-server-sdk');
const { HttpError, objectBody, text } = require('../utils/validation');
const { findAlarm } = require('./alarms');

function notificationController(db, expo, { receiptDelayMs = 15 * 60 * 1000 } = {}) {
  let processing = false;
  let sending = false;
  async function removeInvalidToken(row) {
    // A receipt for an old session must not invalidate a token transferred to another account.
    await db.run('DELETE FROM push_tokens WHERE token = ? AND user_id = ? AND updated_at = ?',
      [row.token, row.user_id, row.updated_at || row.token_updated_at]);
  }
  async function processReceipts() {
    if (processing) return;
    processing = true;
    try {
      await db.run('DELETE FROM push_receipts WHERE expires_at < ?', [Date.now()]);
      const rows = await db.all('SELECT * FROM push_receipts WHERE due_at <= ? LIMIT 1000', [Date.now()]);
      const byId = new Map(rows.map(row => [row.id, row]));
      for (const chunk of expo.chunkPushNotificationReceiptIds(rows.map(row => row.id))) {
        let receipts;
        try {
          receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        } catch {
          continue; // Retry transient provider failures on the next polling interval.
        }
        for (const receiptId of chunk) {
          const receipt = receipts?.[receiptId];
          if (!receipt || !['ok', 'error'].includes(receipt.status)) continue;
          if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
            await removeInvalidToken(byId.get(receiptId));
          }
          await db.run('DELETE FROM push_receipts WHERE id = ?', [receiptId]);
        }
      }
    } finally {
      processing = false;
    }
  }
  function pushToken(body) {
    objectBody(body, ['token']);
    const token = text(body.token, 'push token', 200);
    if (!Expo.isExpoPushToken(token)) throw new HttpError(400, 'Invalid Expo push token');
    return token;
  }
  return {
    processReceipts,
    register: async (req, res) => {
      const token = pushToken(req.body);
      await db.run(`INSERT INTO push_tokens (token, user_id, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at`,
      [token, req.user.id, randomUUID()]);
      res.json({ success: true });
    },
    remove: async (req, res) => {
      const token = pushToken(req.body);
      await db.run('DELETE FROM push_tokens WHERE token = ? AND user_id = ?', [token, req.user.id]);
      res.status(204).end();
    },
    send: async (req, res) => {
      objectBody(req.body, ['alarmId', 'title', 'body']);
      const alarm = await findAlarm(db, req.body.alarmId);
      const title = req.body.title === undefined ? alarm.name : text(req.body.title, 'title', 120);
      const body = req.body.body === undefined ? alarm.description : text(req.body.body, 'body', 2000);
      if (sending) throw new HttpError(429, 'A notification batch is already running');
      sending = true;
      try {
        const tokens = await db.all(`SELECT DISTINCT p.token, p.user_id, p.updated_at FROM push_tokens p
          JOIN subscriptions s ON s.user_id = p.user_id WHERE s.alarm_id = ? LIMIT 1001`, [alarm.id]);
        if (tokens.length > 1000) throw new HttpError(413, 'Too many recipients for testing endpoint');
        const byToken = new Map(tokens.map(row => [row.token, row]));
        const messages = tokens.map(row => ({
          to: row.token, sound: 'default', channelId: 'alarms', title, body,
          data: { alarmId: alarm.id, userId: row.user_id },
        }));
        let accepted = 0;
        let failed = 0;
        for (const chunk of expo.chunkPushNotifications(messages)) {
          let tickets;
          try {
            tickets = await expo.sendPushNotificationsAsync(chunk);
          } catch {
            failed += chunk.length;
            continue;
          }
          for (let i = 0; i < chunk.length; i++) {
            const ticket = tickets?.[i];
            const row = byToken.get(chunk[i].to);
            if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length <= 200) {
              accepted++;
              await db.run(`INSERT OR REPLACE INTO push_receipts
                (id, token, token_updated_at, user_id, due_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
              [ticket.id, row.token, row.updated_at, row.user_id, Date.now() + receiptDelayMs, Date.now() + 24 * 60 * 60 * 1000]);
            } else {
              failed++;
              if (ticket?.details?.error === 'DeviceNotRegistered') await removeInvalidToken(row);
            }
          }
        }
        res.json({ notification: { alarmId: alarm.id, recipients: tokens.length, accepted, failed } });
      } finally {
        sending = false;
      }
    },
  };
}

module.exports = { notificationController };
