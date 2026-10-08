import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { errorMessage } from '../api';
import { useAlarms } from './AlarmsContext';
import { useAuth } from './AuthContext';

type PushValue = {
  enabled: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  enable: () => Promise<void>;
};
type PushState = Omit<PushValue, 'enable'> & { key: number | null };
const empty: PushState = { key: null, enabled: false, busy: false, error: null, notice: null };
const PushContext = createContext<PushValue | undefined>(undefined);

function projectId() {
  const id = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Push setup is incomplete: run npx eas-cli@latest init to link this app to an EAS project, then rebuild the development client.');
  }
  return id;
}

function supportedDevice() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Push notifications require an iOS or Android development build.');
  }
  if (!Device.isDevice) throw new Error('Push notifications require a physical device.');
  if (Constants.appOwnership === 'expo') {
    throw new Error('Use a development build, not Expo Go, to enable push notifications.');
  }
}

export function PushProvider({ children }: { children: React.ReactNode }) {
  const { session, registerPushToken } = useAuth();
  const { reload } = useAlarms();
  const key = session?.key ?? null;
  const activeKey = useRef(key);
  activeKey.current = key;
  const activeUserId = useRef(session?.user.id);
  activeUserId.current = session?.user.id;
  const [state, setState] = useState<PushState>(empty);
  const operation = useRef<Promise<void> | null>(null);
  const notificationId = useRef<string | null>(null);
  const queuedToken = useRef<{ key: number; token: Notifications.DevicePushToken } | null>(null);
  const enabledForKey = useRef<number | null>(null);
  const previousKey = useRef<number | null>(null);

  const register = useCallback(async (requestPermission: boolean, devicePushToken?: Notifications.DevicePushToken) => {
    const expectedKey = key;
    if (expectedKey === null) return;
    supportedDevice();
    const id = projectId();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alarms', {
        name: 'Alarm alerts',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    if (activeKey.current !== expectedKey) return;
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && requestPermission) {
      if (!permission.canAskAgain) {
        throw new Error('Notifications are blocked. Enable them in your device Settings, then retry.');
      }
      if (activeKey.current !== expectedKey) return;
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) {
      if (requestPermission) throw new Error('Permission was not granted. You can enable notifications in Settings.');
      return;
    }
    if (activeKey.current !== expectedKey) return;
    // The listener supplies the native token; passing it avoids re-triggering that listener.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const token = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId: id, devicePushToken }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Push registration timed out. Check your connection, then retry.')), 20000);
      }),
    ]).finally(() => clearTimeout(timeout));
    if (activeKey.current !== expectedKey) return;
    await registerPushToken(token.data, expectedKey);
    if (activeKey.current !== expectedKey) return;
    setState(previous => ({ ...previous, key: expectedKey, enabled: true, error: null }));
    if (session) {
      void AsyncStorage.setItem(`germ.push-enabled.${session.user.id}`, 'true').catch(() => {});
    }
  }, [key, registerPushToken, session]);

  const run = useCallback((prompt: boolean, deviceToken?: Notifications.DevicePushToken) => {
    const expectedKey = key;
    if (expectedKey === null) return Promise.resolve();
    enabledForKey.current = expectedKey;
    if (operation.current) {
      if (deviceToken) queuedToken.current = { key: expectedKey, token: deviceToken };
      return operation.current;
    }
    setState(previous => ({
      ...(previous.key === expectedKey ? previous : empty), key: expectedKey, busy: true, error: null,
    }));
    const task = register(prompt, deviceToken).catch(error => {
      if (activeKey.current === expectedKey) {
        setState(previous => ({ ...previous, error: errorMessage(error) }));
      }
    }).finally(() => {
      if (operation.current === task) operation.current = null;
      if (activeKey.current === expectedKey) setState(previous => ({ ...previous, busy: false }));
      const queued = queuedToken.current;
      if (queued?.key === expectedKey && activeKey.current === expectedKey) {
        queuedToken.current = null;
        void run(false, queued.token);
      }
    });
    operation.current = task;
    return task;
  }, [key, register]);

  useEffect(() => {
    setState({ ...empty, key });
    operation.current = null;
    queuedToken.current = null;
    enabledForKey.current = null;
    if (previousKey.current !== null && previousKey.current !== key) {
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      void Notifications.dismissAllNotificationsAsync().catch(() => {});
    }
    previousKey.current = key;
    if (!session) return;
    // Re-register an explicitly enabled preference without ever showing a permission prompt.
    void AsyncStorage.getItem(`germ.push-enabled.${session.user.id}`).then(value => {
      if (value === 'true' && activeKey.current === key) void run(false);
    }).catch(() => {});
  }, [key, run, session]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async notification => {
        const userId = notification.request.content.data?.userId;
        const show = activeKey.current !== null &&
          (userId === undefined || Number(userId) === activeUserId.current);
        return {
          shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false,
        };
      },
    });
    return () => Notifications.setNotificationHandler(null);
  }, []);

  useEffect(() => {
    if (key === null || Platform.OS === 'web') return;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      if (activeKey.current !== key) return;
      const id = response.notification.request.identifier;
      if (notificationId.current === id) return;
      notificationId.current = id;
      const content = response.notification.request.content;
      if (content.data?.userId !== undefined && Number(content.data.userId) !== session?.user.id) return;
      const alarmId = Number(content.data?.alarmId);
      setState(previous => ({ ...previous, key, notice: 'An alarm update was received. Your current subscriptions are shown below.' }));
      router.replace(Number.isSafeInteger(alarmId) && alarmId > 0
        ? { pathname: '/', params: { alarmId: String(alarmId) } }
        : '/');
      void reload();
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    const responses = Notifications.addNotificationResponseReceivedListener(handleResponse);
    const received = Notifications.addNotificationReceivedListener(notification => {
      if (activeKey.current !== key) return;
      const userId = notification.request.content.data?.userId;
      if (userId !== undefined && Number(userId) !== session?.user.id) return;
      setState(previous => ({
        ...previous, key, notice: 'An alarm update was received. Your subscriptions have been refreshed.',
      }));
      void reload();
    });
    const tokens = Notifications.addPushTokenListener(deviceToken => {
      if (activeKey.current === key && enabledForKey.current === key) void run(false, deviceToken);
    });
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleResponse(response);
    }).catch(() => {});
    return () => {
      responses.remove();
      received.remove();
      tokens.remove();
    };
  }, [key, reload, run, session]);

  const visible = state.key === key ? state : empty;
  return (
    <PushContext.Provider value={{ ...visible, enable: () => run(true) }}>
      {children}
    </PushContext.Provider>
  );
}

export function usePush() {
  const context = useContext(PushContext);
  if (!context) throw new Error('PushProvider is missing.');
  return context;
}
