class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function createApiClient({ baseUrl, getSession, onUnauthorized, fetchImpl = fetch, timeoutMs = 15000 }) {
  return async function request(path, { method = 'GET', body, authenticated = true, session } = {}) {
    const captured = session || getSession();
    if (!baseUrl || !/^https?:\/\/[^/]+/i.test(baseUrl)) {
      throw new ApiError('Set EXPO_PUBLIC_API_URL to your server address, then restart Expo.');
    }
    if (authenticated && !captured?.token) throw new ApiError('Please sign in again.', 401);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(authenticated ? { Authorization: ['Bearer', captured.token].join(' ') } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 && authenticated) onUnauthorized(captured);
        const messages = {
          400: 'Check the information entered and try again.',
          401: authenticated ? 'Your session expired. Please sign in again.' : 'Username or password is incorrect.',
          403: 'You do not have permission to do that.',
          404: 'This item is no longer available.',
          409: authenticated ? 'This change conflicts with the current state. Refresh and try again.' : 'That username or email is already registered.',
          429: 'Too many attempts. Please wait and try again.',
        };
        throw new ApiError(messages[response.status] || 'The server could not complete the request. Please try again.', response.status);
      }
      if (response.status === 204) return null;
      try {
        return await response.json();
      } catch {
        throw new ApiError('The server returned an invalid response. Please try again.');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error.name === 'AbortError'
        ? 'The request timed out. Check your connection and retry.'
        : 'Cannot reach the server. Check your connection and server address.');
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createApiClient, ApiError };
