import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest, errorMessage, SessionChangedError, User, validUser } from '../api';

type Session = { token: string; user: User; key: number };
type PushState = { tokens: Set<string>; pending: Set<Promise<void>> };
type AuthValue = {
  session: Session | null;
  initializing: boolean;
  busy: boolean;
  message: string | null;
  savedUsername: string;
  authenticate: (mode: 'login' | 'register', username: string, password: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  registerPushToken: (token: string, expectedKey: number) => Promise<void>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);
const TOKEN_KEY = 'germ.jwt';
const USERNAME_KEY = 'germ.username';
const pushStorageKey = (userId: number) => `germ.push-token.${userId}`;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedUsername, setSavedUsername] = useState('');
  const current = useRef<Session | null>(null);
  const epoch = useRef(0);
  const storageQueue = useRef<Promise<unknown>>(Promise.resolve());
  const cleanupQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pushStates = useRef(new Map<number, PushState>());

  const secureMutation = useCallback((action: () => Promise<void>) => {
    const operation = storageQueue.current.catch(() => {}).then(action);
    storageQueue.current = operation;
    return operation;
  }, []);

  const endSession = useCallback((notice: string | null = null) => {
    const old = current.current;
    const version = ++epoch.current;
    current.current = null;
    setSession(null);
    setBusy(false);
    setInitializing(false);
    setMessage(notice);
    void secureMutation(async () => {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }).catch(() => {
      if (epoch.current === version) {
        setMessage('Signed out, but secure storage could not be cleared. Retry sign out before restarting.');
      }
    });
    if (old) {
      const pushState = pushStates.current.get(old.key);
      pushStates.current.delete(old.key);
      // Finish in-flight registrations before removing tokens; a later login waits for this barrier.
      cleanupQueue.current = cleanupQueue.current.catch(() => {}).then(async () => {
        await Promise.allSettled([...(pushState?.pending ?? [])]);
        const results = await Promise.allSettled([...(pushState?.tokens ?? [])].map(token =>
          apiRequest('/api/push-tokens', old.token, 'DELETE', { token })));
        const failed = results.some(result => result.status === 'rejected');
        if (!failed) {
          await secureMutation(() => SecureStore.deleteItemAsync(pushStorageKey(old.user.id))).catch(() => {});
        } else if (epoch.current === version) {
          setMessage(notice || 'Signed out locally. The server could not remove this device’s push registration; it may still receive alerts.');
        }
      });
    }
  }, [secureMutation]);

  const restore = useCallback(async () => {
    const version = ++epoch.current;
    setInitializing(true);
    setMessage(null);
    try {
      await storageQueue.current.catch(() => {});
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (epoch.current !== version || !token) return;
      const result = await apiRequest<{ user: User }>('/api/auth/me', token);
      if (!result || !validUser(result.user)) throw new Error('The server returned an invalid user.');
      const pushToken = await SecureStore.getItemAsync(pushStorageKey(result.user.id));
      if (epoch.current !== version) return;
      if (pushToken) pushStates.current.set(version, { tokens: new Set([pushToken]), pending: new Set() });
      const restored = { token, user: result.user, key: version };
      current.current = restored;
      setSession(restored);
    } catch (error) {
      if (epoch.current !== version) return;
      if (error instanceof ApiError && error.status === 401) {
        endSession('Your session expired. Please sign in again.');
      } else {
        setMessage(`Could not restore your session. ${errorMessage(error)}`);
      }
    } finally {
      if (epoch.current === version) setInitializing(false);
    }
  }, [endSession]);

  useEffect(() => {
    void AsyncStorage.getItem(USERNAME_KEY).then(name => {
      if (name) setSavedUsername(name);
    }).catch(() => {});
    void restore();
    return () => { epoch.current++; };
  }, [restore]);

  const authenticate = useCallback(async (mode: 'login' | 'register', username: string, password: string) => {
    const version = ++epoch.current;
    current.current = null;
    setSession(null);
    setBusy(true);
    setMessage(null);
    try {
      await cleanupQueue.current;
      if (epoch.current !== version) throw new SessionChangedError();
      const result = await apiRequest<{ token: string; user: User }>(
        `/api/auth/${mode}`, undefined, 'POST', { username: username.trim(), password });
      if (!result || typeof result.token !== 'string' || !result.token || !validUser(result.user)) {
        throw new Error('The server returned an invalid sign-in response.');
      }
      if (epoch.current !== version) throw new SessionChangedError();
      const pushToken = await SecureStore.getItemAsync(pushStorageKey(result.user.id));
      if (epoch.current !== version) throw new SessionChangedError();
      await secureMutation(async () => {
        if (epoch.current === version) await SecureStore.setItemAsync(TOKEN_KEY, result.token);
      });
      if (epoch.current !== version) throw new SessionChangedError();
      if (pushToken) pushStates.current.set(version, { tokens: new Set([pushToken]), pending: new Set() });
      const next = { token: result.token, user: result.user, key: version };
      current.current = next;
      setSession(next);
      setSavedUsername(result.user.username);
      void AsyncStorage.setItem(USERNAME_KEY, result.user.username).catch(() => {});
    } finally {
      if (epoch.current === version) setBusy(false);
    }
  }, [secureMutation]);

  const request = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const expected = session;
    if (!expected || current.current?.key !== expected.key) throw new SessionChangedError();
    try {
      const result = await apiRequest<T>(path, expected.token, method, body);
      if (current.current?.key !== expected.key) throw new SessionChangedError();
      return result;
    } catch (error) {
      if (current.current?.key !== expected.key) throw new SessionChangedError();
      if (error instanceof ApiError && error.status === 401) {
        endSession('Your session expired. Please sign in again.');
      }
      throw error;
    }
  }, [endSession, session]);

  const registerPushToken = useCallback(async (token: string, expectedKey: number) => {
    const expected = current.current;
    if (!expected || expected.key !== expectedKey) throw new SessionChangedError();
    let state = pushStates.current.get(expectedKey);
    if (!state) {
      state = { tokens: new Set(), pending: new Set() };
      pushStates.current.set(expectedKey, state);
    }
    state.tokens.add(token);
    const operation = (async () => {
      try {
        await secureMutation(async () => {
          if (current.current?.key === expectedKey) {
            await SecureStore.setItemAsync(pushStorageKey(expected.user.id), token);
          }
        });
        if (current.current?.key !== expectedKey) throw new SessionChangedError();
        await apiRequest('/api/push-tokens', expected.token, 'POST', { token });
        if (current.current?.key !== expectedKey) throw new SessionChangedError();
        const previous = [...state.tokens].filter(value => value !== token);
        await Promise.all(previous.map(async oldToken => {
          await apiRequest('/api/push-tokens', expected.token, 'DELETE', { token: oldToken });
          state.tokens.delete(oldToken);
        }));
      } catch (error) {
        if (current.current?.key === expectedKey && error instanceof ApiError && error.status === 401) {
          endSession('Your session expired. Please sign in again.');
        }
        throw error;
      }
    })();
    state.pending.add(operation);
    try {
      await operation;
    } finally {
      state.pending.delete(operation);
    }
  }, [endSession, secureMutation]);

  return (
    <AuthContext.Provider value={{
      session, initializing, busy, message, savedUsername, authenticate,
      logout: () => endSession(), restore, request, registerPushToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is missing.');
  return context;
}
