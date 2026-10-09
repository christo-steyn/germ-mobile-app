import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, createApiClient } from '../api/client';
import { finishLogout } from '../api/logout';
import { NotificationSetupError, registerPushToken } from '../utils/notifications';

const AuthContext = createContext(null);
const TOKEN_KEY = 'germ.auth.token';
const PUSH_TOKEN_KEY = 'germ.notifications.token';
const EXPIRY_NOTICE = 'Your session expired. This device may still receive account alarms. Disable Germ Alarm notifications in device settings before switching accounts, or sign in again and retry signing out.';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [notice, setNotice] = useState('');
  const [pushState, setPushState] = useState({ busy: false, message: 'Notifications have not been enabled.' });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const current = useRef(null);
  const serial = useRef(0);
  const storageQueue = useRef(Promise.resolve());
  const pushTask = useRef(null);
  const pushToken = useRef(null);

  const store = useCallback((token) => {
    const operation = storageQueue.current.catch(() => {}).then(() => (
      token ? AsyncStorage.setItem(TOKEN_KEY, token) : AsyncStorage.removeItem(TOKEN_KEY)
    ));
    storageQueue.current = operation;
    return operation;
  }, []);

  const invalidate = useCallback((captured) => {
    if (!captured || current.current?.id !== captured.id) return;
    serial.current += 1;
    current.current = null;
    setSession(null);
    pushToken.current = null;
    pushTask.current = null;
    setPushState({ busy: false, message: 'Notifications have not been enabled.' });
    setLogoutError('');
    setNotice(EXPIRY_NOTICE);
    const expiredSerial = serial.current;
    store(null).catch(() => {
      if (serial.current === expiredSerial) setNotice(`${EXPIRY_NOTICE} Saved credentials could not be removed; retry signing in.`);
    });
  }, [store]);

  const api = useMemo(() => createApiClient({
    baseUrl: process.env.EXPO_PUBLIC_API_URL,
    getSession: () => current.current,
    onUnauthorized: invalidate,
  }), [invalidate]);

  const restore = useCallback(async () => {
    const attempt = ++serial.current;
    setRestoring(true);
    setRestoreError('');
    try {
      await storageQueue.current.catch(() => {});
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (attempt !== serial.current) return;
      if (token) {
        const candidate = { id: attempt, token };
        current.current = candidate;
        const result = await api('/api/user/profile', { session: candidate });
        if (current.current?.id !== attempt) return;
        if (!result?.user) throw new Error('The server returned an invalid profile.');
        const restored = { ...candidate, user: result.user };
        const savedPushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
        if (current.current?.id !== attempt) return;
        pushToken.current = savedPushToken ? { id: attempt, token: savedPushToken } : null;
        current.current = restored;
        setSession(restored);
      }
    } catch (error) {
      if (attempt === serial.current) {
        current.current = null;
        setRestoreError(error instanceof ApiError ? error.message : 'Unable to restore your saved session. Retry or clear it to sign in.');
      }
    } finally {
      setRestoring(false);
    }
  }, [api]);

  useEffect(() => { restore(); }, [restore]);

  const authenticate = useCallback(async (mode, values) => {
    const attempt = ++serial.current;
    const result = await api(`/auth/${mode}`, { method: 'POST', body: values, authenticated: false });
    if (attempt !== serial.current) return;
    if (typeof result?.token !== 'string' || !result.token || !result.user) {
      throw new Error('The server returned an invalid sign-in response.');
    }
    try {
      const savedPushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
      await store(result.token);
      if (attempt === serial.current) pushToken.current = savedPushToken ? { id: attempt, token: savedPushToken } : null;
    } catch {
      throw new Error('Unable to save this session on your device. Please retry.');
    }
    if (attempt !== serial.current) return;
    const next = { id: attempt, token: result.token, user: result.user };
    current.current = next;
    setNotice('');
    setLogoutError('');
    setSession(next);
  }, [api, store]);

  const enableNotifications = useCallback(() => {
    const captured = current.current;
    if (!captured?.user) return Promise.resolve();
    if (pushTask.current?.id === captured.id) return pushTask.current.promise;
    setPushState({ busy: true, message: 'Requesting notification access…' });
    const promise = (async () => {
      try {
        let timer;
        const token = await Promise.race([
          registerPushToken(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new NotificationSetupError('Notification setup timed out. Check your connection and retry.')), 20000);
          }),
        ]).finally(() => clearTimeout(timer));
        if (current.current?.id !== captured.id) return;
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
        if (current.current?.id !== captured.id) return;
        pushToken.current = { id: captured.id, token };
        await api('/api/notifications/token', { method: 'POST', body: { token }, session: captured });
        if (current.current?.id !== captured.id) {
          await api('/api/notifications/token', { method: 'DELETE', body: { token }, session: captured });
          return;
        }
        setPushState({ busy: false, message: 'Notifications enabled on this device.' });
      } catch (error) {
        if (current.current?.id === captured.id) {
          setPushState({ busy: false, message: error instanceof ApiError || error instanceof NotificationSetupError
            ? error.message
            : 'Unable to enable notifications. Check your network, EAS project and push credentials, then retry.' });
        }
      } finally {
        if (pushTask.current?.id === captured.id) pushTask.current = null;
      }
    })();
    pushTask.current = { id: captured.id, promise };
    return promise;
  }, [api]);

  useEffect(() => {
    if (session) enableNotifications();
  }, [session?.id, enableNotifications]);

  const logout = useCallback(async () => {
    const captured = current.current;
    if (!captured || loggingOut) return;
    const logoutSerial = serial.current;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await finishLogout({
        pendingRegistration: pushTask.current?.id === captured.id ? pushTask.current.promise : undefined,
        isCurrent: () => serial.current === logoutSerial && current.current?.id === captured.id,
        getRegistration: () => pushToken.current?.id === captured.id ? pushToken.current : null,
        unregister: async (registration) => {
          await api('/api/notifications/token', {
            method: 'DELETE', body: { token: registration.token }, session: captured,
          });
          if (current.current?.id === captured.id) {
            await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
            if (current.current?.id === captured.id) pushToken.current = null;
          }
        },
        clearSession: async () => {
          await store(null);
          if (serial.current !== logoutSerial || current.current?.id !== captured.id) return;
          serial.current += 1;
          current.current = null;
          setSession(null);
          pushToken.current = null;
          setPushState({ busy: false, message: 'Notifications have not been enabled.' });
          setNotice('');
        },
      });
    } catch {
      if (current.current?.id === captured.id) {
        setLogoutError('Sign-out paused: we could not remove this device’s notification registration or saved credentials. You are still signed in. Check your connection and retry. If the server remains unavailable, disable Germ Alarm notifications in device settings before leaving this account.');
      }
    } finally { setLoggingOut(false); }
  }, [api, loggingOut, store]);

  const discardRestore = useCallback(async () => {
    try {
      await store(null);
      serial.current += 1;
      current.current = null;
      setRestoreError('');
      setRestoring(false);
    } catch {
      setRestoreError('Unable to remove saved credentials. Please retry.');
    }
  }, [store]);

  return (
    <AuthContext.Provider value={{
      session, api, restoring, restoreError, restore, discardRestore, authenticate,
      logout, loggingOut, logoutError, notice, pushState, enableNotifications,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
