import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const AlarmsContext = createContext(null);

export function AlarmsProvider({ children }) {
  const { api, session } = useAuth();
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const attempt = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/alarms', { session });
      if (!Array.isArray(data?.alarms)) throw new Error('The server returned an invalid alarm list.');
      if (attempt === generation.current) setAlarms(data.alarms);
    } catch (failure) {
      if (attempt === generation.current) setError(failure.message);
    } finally {
      if (attempt === generation.current) setLoading(false);
    }
  }, [api, session.id]);
  useEffect(() => {
    refresh();
    return () => { generation.current += 1; };
  }, [refresh]);
  return <AlarmsContext.Provider value={{ alarms, loading, error, refresh }}>{children}</AlarmsContext.Provider>;
}

export const useAlarms = () => useContext(AlarmsContext);
