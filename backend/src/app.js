const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { createHash, timingSafeEqual } = require('node:crypto');
const { Expo } = require('expo-server-sdk');
const { hashPassword, verifyPassword } = require('./passwords');
const { alarmJson } = require('./database');

function createApp({ db, jwtSecret, adminKey, pushService, corsOrigin = false }) {
  if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }
  if (adminKey && (Buffer.byteLength(adminKey) < 32 || adminKey === jwtSecret)) {
    throw new Error('ALARM_ADMIN_KEY must be a separate secret of at least 32 bytes.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const rateOptions = {
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  };
  app.use('/api', rateLimit({ ...rateOptions, windowMs: 60_000, limit: 120 }));
  const authLimit = rateLimit({ ...rateOptions, windowMs: 15 * 60_000, limit: 20 });
  const getAlarm = id => db.prepare('SELECT * FROM alarms WHERE id = ?').get(id);
  const validId = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
  const tokenFor = user => jwt.sign({}, jwtSecret, {
    subject: String(user.id), expiresIn: '7d', algorithm: 'HS256',
    issuer: 'germ-api', audience: 'germ-mobile',
  });

  function authenticate(req, res, next) {
    const [scheme, token, extra] = (req.get('authorization') || '').split(' ');
    try {
      if (scheme !== 'Bearer' || !token || extra) throw new Error('Missing token');
      const payload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'], issuer: 'germ-api', audience: 'germ-mobile',
      });
      if (!Number.isFinite(payload.exp)) throw new Error('Missing token expiry');
      req.tokenExpiresAt = payload.exp * 1000;
      req.user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(Number(payload.sub));
      if (!req.user) throw new Error('Unknown user');
      next();
    } catch {
      res.status(401).json({ error: 'Please log in again.' });
    }
  }

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.post('/api/auth/:action', authLimit, async (req, res, next) => {
    if (!['register', 'login'].includes(req.params.action)) return next();
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{3,32}$/.test(username) ||
        typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Use a 3–32 character username (letters, numbers, _ or -) and an 8–128 character password.' });
    }
    const normalized = username.toLowerCase();
    let user;
    if (req.params.action === 'register') {
      const passwordHash = await hashPassword(password);
      try {
        const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(normalized, passwordHash);
        user = { id: Number(result.lastInsertRowid), username: normalized };
      } catch (error) {
        if (error.errcode === 2067) return res.status(409).json({ error: 'Username is unavailable.' });
        throw error;
      }
    } else {
      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(normalized);
      // Still perform password derivation for unknown users.
      const stored = row?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
      const valid = await verifyPassword(password, stored);
      if (!row || !valid) return res.status(401).json({ error: 'Invalid username or password.' });
      user = { id: row.id, username: row.username };
    }
    res.status(req.params.action === 'register' ? 201 : 200).json({ user, token: tokenFor(user) });
  });

  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
  app.get('/api/alarms', authenticate, (req, res) => {
    res.json({ alarms: db.prepare('SELECT * FROM alarms ORDER BY id').all().map(alarmJson) });
  });
  app.get('/api/subscriptions', authenticate, (req, res) => {
    const rows = db.prepare(`SELECT a.* FROM alarms a JOIN subscriptions s ON s.alarm_id = a.id
      WHERE s.user_id = ? ORDER BY a.id`).all(req.user.id);
    res.json({ subscriptions: rows.map(alarmJson) });
  });
  app.post('/api/subscriptions', authenticate, (req, res) => {
    const id = req.body?.alarmId;
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'A valid alarmId is required.' });
    const alarm = getAlarm(id);
    if (!alarm) return res.status(404).json({ error: 'Alarm not found.' });
    db.prepare('INSERT OR IGNORE INTO subscriptions (user_id, alarm_id) VALUES (?, ?)').run(req.user.id, id);
    res.status(201).json({ subscription: alarmJson(alarm) });
  });
  app.delete('/api/subscriptions/:id', authenticate, (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid alarm ID.' });
    db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND alarm_id = ?').run(req.user.id, Number(req.params.id));
    res.sendStatus(204);
  });
  app.post('/api/push-tokens', authenticate, (req, res) => {
    const token = req.body?.token;
    if (typeof token !== 'string' || token.length > 256 || !Expo.isExpoPushToken(token)) {
      return res.status(400).json({ error: 'A valid Expo push token is required.' });
    }
    db.prepare(`INSERT INTO push_tokens (token, user_id, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at`)
      .run(token, req.user.id, req.tokenExpiresAt);
    res.sendStatus(204);
  });
  app.delete('/api/push-tokens', authenticate, (req, res) => {
    if (typeof req.body?.token !== 'string') return res.status(400).json({ error: 'A token is required.' });
    db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(req.body.token, req.user.id);
    res.sendStatus(204);
  });
  app.patch('/api/admin/alarms/:id', async (req, res) => {
    const supplied = req.get('x-alarm-admin-key') || '';
    const digest = value => createHash('sha256').update(value).digest();
    if (!adminKey || !timingSafeEqual(digest(supplied), digest(adminKey))) {
      return res.status(403).json({ error: 'Alarm administration is not authorized.' });
    }
    if (!validId(req.params.id) || typeof req.body?.active !== 'boolean') {
      return res.status(400).json({ error: 'A valid alarm ID and boolean active value are required.' });
    }
    const row = getAlarm(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Alarm not found.' });
    db.prepare('UPDATE alarms SET active = ?, updated_at = ? WHERE id = ?')
      .run(Number(req.body.active), new Date().toISOString(), row.id);
    const alarm = alarmJson(getAlarm(row.id));
    const notifications = alarm.active && !row.active
      ? await pushService.sendAlarm(alarm) : { sent: 0, failed: 0 };
    res.json({ alarm, notifications });
  });
  app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    console.error('Request failed:', error.message);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });
  return app;
}

module.exports = { createApp };
