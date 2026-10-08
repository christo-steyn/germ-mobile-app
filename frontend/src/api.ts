export type User = { id: number; username: string };
export type Alarm = {
  id: number;
  name: string;
  description: string;
  active: boolean;
  updatedAt: string;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export class SessionChangedError extends Error {
  constructor() {
    super('Your session has changed. Please try again.');
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function apiUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!value) {
    throw new Error('Set EXPO_PUBLIC_API_URL in your .env file, then restart Expo.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be a valid HTTP(S) server URL.');
  }
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && __DEV__))) {
    throw new Error('Use an HTTPS API URL (HTTP is allowed only during development).');
  }
  return value;
}

export async function apiRequest<T>(
  path: string,
  token?: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const baseUrl = apiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const text = response.status === 204 ? '' : await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      if (response.ok) throw new Error('The server returned an invalid JSON response.');
    }
    if (!response.ok) {
      const message = typeof data === 'object' && data !== null && 'error' in data &&
        typeof data.error === 'string' ? data.error : `Request failed (${response.status}).`;
      throw new ApiError(message, response.status);
    }
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The server took too long to respond. Please retry.');
    if (error instanceof TypeError) {
      throw new Error('Cannot reach the server. Check your connection and API URL.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function validUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const user = value as User;
  return Number.isSafeInteger(user.id) && user.id > 0 &&
    typeof user.username === 'string' && user.username.length > 0;
}

export function validAlarm(value: unknown): value is Alarm {
  if (!value || typeof value !== 'object') return false;
  const alarm = value as Alarm;
  return Number.isSafeInteger(alarm.id) && alarm.id > 0 &&
    typeof alarm.name === 'string' && typeof alarm.description === 'string' &&
    typeof alarm.active === 'boolean' && typeof alarm.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(alarm.updatedAt));
}

export function readAlarms(data: unknown, key: 'alarms' | 'subscriptions'): Alarm[] {
  const values = data && typeof data === 'object' && key in data
    ? (data as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(values) || !values.every(validAlarm)) {
    throw new Error('The server returned an invalid alarm list.');
  }
  return values;
}
