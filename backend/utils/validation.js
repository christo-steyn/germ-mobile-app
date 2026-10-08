class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function objectBody(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !fields.includes(key))) {
    throw new HttpError(400, 'Invalid request body');
  }
}

function text(value, name, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return value.trim();
}

function id(value, name = 'id') {
  if (!['number', 'string'].includes(typeof value) ||
      !/^[1-9]\d{0,14}$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return Number(value);
}

function safeUser(user) {
  return { id: user.id, username: user.username, email: user.email, createdAt: user.created_at };
}

module.exports = { HttpError, objectBody, text, id, safeUser };
