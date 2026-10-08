import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alarm, errorMessage, readAlarms, validAlarm } from '../api';
import { useAuth } from './AuthContext';

type AlarmState = {
  key: number | null;
  alarms: Alarm[];
  subscriptions: Alarm[];
  loading: boolean;
  error: string | null;
  pending: number[];
};
type AlarmsValue = Omit<AlarmState, 'key'> & {
  reload: () => Promise<void>;
  toggle: (alarmId: number) => Promise<void>;
};
const empty: AlarmState = {
  key: null, alarms: [], subscriptions: [], loading: false, error: null, pending: [],
};
const AlarmsContext = createContext<AlarmsValue | undefined>(undefined);

export function AlarmsProvider({ children }: { children: React.ReactNode }) {
  const { session, request } = useAuth();
  const [state, setState] = useState<AlarmState>(empty);
  const key = session?.key ?? null;
  const currentKey = useRef(key);
  currentKey.current = key;
  const loadVersion = useRef(0);
  const mutations = useRef(new Set<string>());

  const reload = useCallback(async () => {
    if (key === null) return;
    const version = ++loadVersion.current;
    setState(previous => ({
      ...(previous.key === key ? previous : empty), key, loading: true, error: null,
    }));
    try {
      const [all, subscribed] = await Promise.all([
        request<unknown>('/api/alarms'),
        request<unknown>('/api/subscriptions'),
      ]);
      const alarms = readAlarms(all, 'alarms');
      const subscriptions = readAlarms(subscribed, 'subscriptions');
      if (currentKey.current !== key || version !== loadVersion.current) return;
      setState(previous => ({ ...previous, key, alarms, subscriptions, loading: false, error: null }));
    } catch (error) {
      if (currentKey.current !== key || version !== loadVersion.current) return;
      setState(previous => ({ ...previous, loading: false, error: errorMessage(error) }));
    }
  }, [key, request]);

  useEffect(() => {
    setState({ ...empty, key });
    void reload();
    return () => { loadVersion.current++; };
  }, [key, reload]);

  const toggle = useCallback(async (alarmId: number) => {
    if (key === null || state.key !== key) return;
    const mutationId = `${key}:${alarmId}`;
    if (mutations.current.has(mutationId)) return;
    mutations.current.add(mutationId);
    // A response loaded before this mutation must never overwrite its result.
    loadVersion.current++;
    setState(previous => ({ ...previous, loading: false, error: null, pending: [...previous.pending, alarmId] }));
    const subscribed = state.subscriptions.some(alarm => alarm.id === alarmId);
    try {
      let added: Alarm | undefined;
      if (subscribed) {
        await request(`/api/subscriptions/${alarmId}`, 'DELETE');
      } else {
        const result = await request<{ subscription: Alarm }>('/api/subscriptions', 'POST', { alarmId });
        if (!result || !validAlarm(result.subscription) || result.subscription.id !== alarmId) {
          throw new Error('The server returned an invalid subscription.');
        }
        added = result.subscription;
      }
      if (currentKey.current !== key) return;
      loadVersion.current++;
      setState(previous => ({
        ...previous, loading: false,
        subscriptions: subscribed
          ? previous.subscriptions.filter(alarm => alarm.id !== alarmId)
          : [...previous.subscriptions.filter(alarm => alarm.id !== alarmId), added!],
      }));
    } catch (error) {
      if (currentKey.current === key) {
        setState(previous => ({ ...previous, error: errorMessage(error) }));
      }
    } finally {
      mutations.current.delete(mutationId);
      if (currentKey.current === key) {
        setState(previous => ({ ...previous, pending: previous.pending.filter(id => id !== alarmId) }));
      }
    }
  }, [key, request, state]);

  const visible = state.key === key ? state : { ...empty, loading: key !== null };
  return (
    <AlarmsContext.Provider value={{ ...visible, reload, toggle }}>
      {children}
    </AlarmsContext.Provider>
  );
}

export function useAlarms() {
  const context = useContext(AlarmsContext);
  if (!context) throw new Error('AlarmsProvider is missing.');
  return context;
}
