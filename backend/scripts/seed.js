const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const bcrypt = require('bcrypt');
const { openDatabase } = require('../models/database');
const { resolveDatabasePath } = require('../config');

async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Seeding is disabled in production');
  const db = await openDatabase(resolveDatabasePath());
  try {
    const hash = await bcrypt.hash('DemoPassword123!', 12);
    await db.run('INSERT OR IGNORE INTO users (username, email, password_hash) VALUES (?, ?, ?)', ['demo', 'demo@example.test', hash]);
    if (!(await db.get('SELECT id FROM alarms LIMIT 1'))) {
      for (const alarm of [
        ['Severe weather', 'Strong winds and heavy rainfall expected. Seek shelter.', 'high'],
        ['Air quality advisory', 'Limit prolonged outdoor activity today.', 'medium'],
        ['Community notice', 'Local emergency preparedness exercise scheduled.', 'low'],
      ]) await db.run('INSERT INTO alarms (name, description, severity) VALUES (?, ?, ?)', alarm);
    }
    console.log('Development seed complete. Demo username: demo; password: DemoPassword123!');
  } finally {
    await db.close();
  }
}

seed().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
