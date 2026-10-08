const { HttpError, objectBody, text, id } = require('../utils/validation');

function alarmView(row) {
  return { id: row.id, name: row.name, description: row.description, severity: row.severity, createdAt: row.created_at };
}

async function findAlarm(db, value) {
  const alarm = await db.get('SELECT * FROM alarms WHERE id = ?', [id(value, 'alarmId')]);
  if (!alarm) throw new HttpError(404, 'Alarm not found');
  return alarm;
}

function alarmController(db) {
  return {
    list: async (req, res) => res.json({ alarms: (await db.all('SELECT * FROM alarms ORDER BY id DESC')).map(alarmView) }),
    get: async (req, res) => res.json({ alarm: alarmView(await findAlarm(db, req.params.id)) }),
    create: async (req, res) => {
      objectBody(req.body, ['name', 'description', 'severity']);
      const name = text(req.body.name, 'name', 120);
      const description = text(req.body.description, 'description', 2000);
      const severity = req.body.severity;
      if (!['low', 'medium', 'high', 'critical'].includes(severity)) throw new HttpError(400, 'Invalid severity');
      const result = await db.run('INSERT INTO alarms (name, description, severity) VALUES (?, ?, ?)', [name, description, severity]);
      res.status(201).json({ alarm: alarmView(await findAlarm(db, result.lastID)) });
    },
    subscribe: async (req, res) => {
      objectBody(req.body, ['alarmId']);
      const alarm = await findAlarm(db, req.body.alarmId);
      const result = await db.run('INSERT OR IGNORE INTO subscriptions (user_id, alarm_id) VALUES (?, ?)', [req.user.id, alarm.id]);
      const row = await db.get('SELECT * FROM subscriptions WHERE user_id = ? AND alarm_id = ?', [req.user.id, alarm.id]);
      res.status(result.changes ? 201 : 200).json({ subscription: { id: row.id, alarmId: alarm.id, createdAt: row.subscribed_at, alarm: alarmView(alarm) } });
    },
    unsubscribe: async (req, res) => {
      await db.run('DELETE FROM subscriptions WHERE user_id = ? AND alarm_id = ?', [req.user.id, id(req.params.alarmId, 'alarmId')]);
      res.status(204).end();
    },
    subscriptions: async (req, res) => {
      const rows = await db.all(`SELECT a.*, s.id AS subscription_id, s.subscribed_at
        FROM subscriptions s JOIN alarms a ON a.id = s.alarm_id WHERE s.user_id = ? ORDER BY s.id DESC`, [req.user.id]);
      res.json({ subscriptions: rows.map(row => ({
        id: row.subscription_id, alarmId: row.id, createdAt: row.subscribed_at, alarm: alarmView(row),
      })) });
    },
  };
}

module.exports = { alarmController, alarmView, findAlarm };
