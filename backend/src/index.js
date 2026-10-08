require('dotenv').config();
const { resolve } = require('node:path');
const { openDatabase } = require('./database');
const { createPushService } = require('./push');
const { createApp } = require('./app');

const db = openDatabase(resolve(process.env.DATABASE_PATH || './data/germ.db'));
const pushService = createPushService(db, process.env.EXPO_ACCESS_TOKEN);
const app = createApp({
  db, pushService, jwtSecret: process.env.JWT_SECRET,
  adminKey: process.env.ALARM_ADMIN_KEY, corsOrigin: process.env.CORS_ORIGIN || false,
});
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '0.0.0.0', () => console.log(`Germ API listening on port ${port}`));
const receiptTimer = setInterval(() => {
  pushService.checkReceipts().catch(() => console.error('Could not retrieve Expo push receipts.'));
}, 60_000);
receiptTimer.unref();

function shutdown() {
  clearInterval(receiptTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
