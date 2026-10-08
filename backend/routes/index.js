const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { HttpError, safeUser } = require('../utils/validation');
const { authController } = require('../controllers/auth');
const { alarmController } = require('../controllers/alarms');
const { notificationController } = require('../controllers/notifications');

function routes(db, config, expo, options) {
  const router = express.Router();
  const auth = authController(db, config);
  const alarms = alarmController(db);
  const notifications = notificationController(db, expo, options);
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many authentication attempts; retry later' },
  });
  const testLimit = rateLimit({
    windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many testing requests; retry later' },
  });
  const guardTest = (req, res, next) => {
    if (!config.testEndpoints || config.production) return next(new HttpError(404, 'Not found'));
    next();
  };
  router.post('/auth/register', authLimit, auth.register);
  router.post('/auth/login', authLimit, auth.login);
  router.use('/api', authenticate(db, config));
  router.get('/api/user/profile', (req, res) => res.json({ user: safeUser(req.user) }));
  router.get('/api/alarms', alarms.list);
  router.get('/api/alarms/:id', alarms.get);
  router.post('/api/alarms', guardTest, testLimit, alarms.create);
  router.get('/api/subscriptions', alarms.subscriptions);
  router.post('/api/subscriptions', alarms.subscribe);
  router.delete('/api/subscriptions/:alarmId', alarms.unsubscribe);
  router.post('/api/notifications/token', notifications.register);
  router.delete('/api/notifications/token', notifications.remove);
  router.post('/api/notifications/send', guardTest, testLimit, notifications.send);
  return { router, processReceipts: notifications.processReceipts };
}

module.exports = { routes };
