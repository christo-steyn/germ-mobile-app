const { Expo } = require('expo-server-sdk');

function createPushService(db, accessToken) {
  const expo = new Expo({ accessToken });
  const removeToken = db.prepare('DELETE FROM push_tokens WHERE token = ?');

  async function sendAlarm(alarm) {
    const devices = db.prepare(`
      SELECT p.token, p.user_id FROM push_tokens p
      JOIN subscriptions s ON s.user_id = p.user_id WHERE s.alarm_id = ?
    `).all(alarm.id);
    const messages = devices.map(device => ({
      to: device.token, sound: 'default', title: alarm.name,
      body: alarm.description, data: { alarmId: alarm.id, userId: device.user_id }, channelId: 'alarms',
    }));
    let sent = 0;
    let failed = 0;
    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, index) => {
          if (ticket.status === 'ok') {
            sent++;
            db.prepare('INSERT OR REPLACE INTO push_receipts (id, token, created_at) VALUES (?, ?, ?)')
              .run(ticket.id, chunk[index].to, Date.now());
          } else {
            failed++;
            if (ticket.details?.error === 'DeviceNotRegistered') removeToken.run(chunk[index].to);
          }
        });
      } catch {
        failed += chunk.length;
      }
    }
    return { sent, failed };
  }

  async function checkReceipts() {
    const pending = db.prepare('SELECT id, token FROM push_receipts WHERE created_at <= ?')
      .all(Date.now() - 15 * 60 * 1000);
    for (const chunk of expo.chunkPushNotificationReceiptIds(pending.map(row => row.id))) {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const id of chunk) {
        const receipt = receipts[id];
        if (!receipt) continue;
        if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
          removeToken.run(pending.find(row => row.id === id).token);
        }
        db.prepare('DELETE FROM push_receipts WHERE id = ?').run(id);
      }
    }
    db.prepare('DELETE FROM push_receipts WHERE created_at < ?').run(Date.now() - 24 * 60 * 60 * 1000);
  }

  return { sendAlarm, checkReceipts };
}

module.exports = { createPushService };
