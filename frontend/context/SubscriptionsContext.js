import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const SubscriptionsContext = createContext(null);
export const alarmId = (alarm) => String(alarm?.id ?? alarm?._id ?? '');

export function SubscriptionsProvider({ children }) {
  const { api, session } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState({});
  const alive = useRef(true);
  const generation = useRef(0);
  const locks = useRef(new Set());
  const refresh = useCallback(async () => {
    const attempt = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/subscriptions', { session });
      if (!Array.isArray(data?.subscriptions)) throw new Error('The server returned an invalid subscription list.');
      if (alive.current && attempt === generation.current) setSubscriptions(data.subscriptions);
    } catch (failure) {
      if (alive.current && attempt === generation.current) setError(failure.message);
    } finally {
      if (alive.current && attempt === generation.current) setLoading(false);
    }
  }, [api, session.id]);
  useEffect(() => {
    alive.current = true;
    refresh();
    return () => { alive.current = false; generation.current += 1; };
  }, [refresh]);
  const isSubscribed = useCallback((id) => subscriptions.some((item) => String(item.alarmId ?? alarmId(item.alarm)) === String(id)), [subscriptions]);
  const toggle = useCallback(async (alarm) => {
    const id = alarmId(alarm);
    if (!id || locks.current.has(id) || loading || error) return;
    locks.current.add(id);
    setPending((value) => ({ ...value, [id]: true }));
    try {
      const subscribed = isSubscribed(id);
      await api(subscribed ? `/api/subscriptions/${encodeURIComponent(id)}` : '/api/subscriptions', {
        method: subscribed ? 'DELETE' : 'POST',
        ...(subscribed ? {} : { body: { alarmId: alarm.id ?? alarm._id } }),
        session,
      });
      await refresh();
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      locks.current.delete(id);
      if (alive.current) setPending((value) => ({ ...value, [id]: false }));
    }
  }, [api, session.id, loading, error, isSubscribed, refresh]);
  return <SubscriptionsContext.Provider value={{ subscriptions, loading, error, pending, isSubscribed, toggle, refresh }}>{children}</SubscriptionsContext.Provider>;
}

export const useSubscriptions = () => useContext(SubscriptionsContext);
