const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const derive = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [salt, encoded] = stored.split(':');
  const hash = await derive(password, salt, 64);
  const expected = Buffer.from(encoded, 'hex');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

module.exports = { hashPassword, verifyPassword };
