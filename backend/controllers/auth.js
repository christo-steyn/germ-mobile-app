const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { HttpError, objectBody, text, safeUser } = require('../utils/validation');

function authController(db, config) {
  const dummyHash = bcrypt.hashSync('not-a-real-user-password', 12);
  function session(user) {
    return {
      token: jwt.sign({}, config.jwtSecret, {
        algorithm: 'HS256', expiresIn: config.jwtExpiresIn,
        subject: String(user.id), issuer: 'germ-api', audience: 'germ-mobile',
      }),
      user: safeUser(user),
    };
  }
  function password(value) {
    if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) {
      throw new HttpError(400, 'Password must be at least 8 characters and at most 72 UTF-8 bytes');
    }
    return value;
  }
  return {
    register: async (req, res) => {
      objectBody(req.body, ['username', 'email', 'password']);
      const username = text(req.body.username, 'username', 40, 3);
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) throw new HttpError(400, 'Invalid username');
      const email = text(req.body.email, 'email', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Invalid email');
      const hash = await bcrypt.hash(password(req.body.password), 12);
      try {
        const result = await db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hash]);
        const user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
        res.status(201).json(session(user));
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') throw new HttpError(409, 'Username or email already registered');
        throw error;
      }
    },
    login: async (req, res) => {
      objectBody(req.body, ['username', 'password']);
      const username = text(req.body.username, 'username', 40);
      const supplied = password(req.body.password);
      const user = await db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
      const valid = await bcrypt.compare(supplied, user?.password_hash || dummyHash);
      if (!user || !valid) throw new HttpError(401, 'Invalid username or password');
      res.json(session(user));
    },
  };
}

module.exports = { authController };
