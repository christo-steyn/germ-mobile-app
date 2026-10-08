const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { Expo } = require('expo-server-sdk');
const { readConfig } = require('./config');
const { openDatabase } = require('./models/database');
const { routes } = require('./routes');

async function createApp(options = {}) {
  const config = options.config || readConfig();
  const db = options.db || await openDatabase(config.dbPath);
  const expo = options.expo || new Expo({ accessToken: config.expoAccessToken });
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || config.origins.includes(origin)),
    credentials: false,
  }));
  app.use(rateLimit({
    windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests; retry later' },
  }));
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/health', async (req, res) => {
    await db.get('SELECT 1');
    res.json({ status: 'ok' });
  });
  const api = routes(db, config, expo, options);
  app.use(api.router);
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
    const message = status === 500 ? 'Internal server error'
      : error.type === 'entity.parse.failed' ? 'Invalid JSON'
        : error.type === 'entity.too.large' ? 'Request body too large' : error.message;
    if (status === 500) console.error('API request failed', error.code || error.name || 'Error');
    res.status(status).json({ error: message });
  });
  app.locals.db = db;
  app.locals.processReceipts = api.processReceipts;
  return app;
}

async function start() {
  const config = readConfig();
  const app = await createApp({ config });
  const server = app.listen(config.port);
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  } catch (error) {
    await app.locals.db.close();
    throw error;
  }
  console.log(`GERM API listening on port ${config.port}`);
  const timer = setInterval(() => {
    app.locals.processReceipts().catch(error => console.error('Receipt polling failed', error.code || error.name));
  }, 60 * 1000);
  timer.unref();
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    server.close(async () => {
      try {
        await app.locals.db.close();
        clearTimeout(deadline);
      } catch {
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (require.main === module) start().catch(error => {
  console.error('Startup failed:', error.message);
  process.exitCode = 1;
});

module.exports = { createApp, start };
