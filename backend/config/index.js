const path = require('node:path');

function resolveDatabasePath(env = process.env) {
  if (env.DB_PATH === ':memory:') return ':memory:';
  return path.resolve(__dirname, '..', env.DB_PATH || 'data/germ.sqlite');
}

function readConfig(env = process.env) {
  const secret = env.JWT_SECRET || '';
  if (Buffer.byteLength(secret) < 32 || !secret.trim()) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes of random secret material');
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const origins = (env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (origins.includes('*')) throw new Error('CORS_ORIGINS must list explicit origins, not *');
  return {
    port,
    jwtSecret: secret,
    jwtExpiresIn: '1h',
    dbPath: resolveDatabasePath(env),
    production: env.NODE_ENV === 'production',
    testEndpoints: env.NODE_ENV !== 'production' && env.ENABLE_TEST_ENDPOINTS === 'true',
    origins,
    expoAccessToken: env.EXPO_ACCESS_TOKEN || undefined,
  };
}

module.exports = { readConfig, resolveDatabasePath };
