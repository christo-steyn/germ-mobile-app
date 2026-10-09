const jwt = require('jsonwebtoken');
const { HttpError, id } = require('../utils/validation');

function authenticate(db, config) {
  return async (req, res, next) => {
    try {
      const header = req.get('authorization') || '';
      const parts = header.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer' ||
          !/^[^\s]+$/.test(parts[1]) || header.length > 2048) {
        throw new Error('Invalid bearer');
      }
      const payload = jwt.verify(parts[1], config.jwtSecret, {
        algorithms: ['HS256'], issuer: 'germ-api', audience: 'germ-mobile',
      });
      if (!payload || typeof payload !== 'object' || !Number.isInteger(payload.exp) ||
          !Number.isInteger(payload.iat) || payload.exp <= payload.iat) throw new Error('Invalid claims');
      const user = await db.get('SELECT * FROM users WHERE id = ?', [id(payload.sub)]);
      if (!user) throw new Error('Unknown user');
      req.user = user;
      next();
    } catch (error) {
      if (error.code?.startsWith('SQLITE')) return next(error);
      next(new HttpError(401, 'Authentication required'));
    }
  };
}

module.exports = { authenticate };
