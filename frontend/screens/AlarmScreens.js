import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlarms } from '../context/AlarmsContext';
import { alarmId, useSubscriptions } from '../context/SubscriptionsContext';
import { useAuth } from '../context/AuthContext';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { Button, Empty, Feedback, Loading, colors, styles } from '../components/ui';

export function AlarmListScreen({ navigation, route }) {
  const home = route.name === 'Home';
  const alarms = useAlarms();
  const subscriptions = useSubscriptions();
  const data = home ? subscriptions.subscriptions.map((item) => item.alarm).filter(Boolean) : alarms.alarms;
  const loading = home ? subscriptions.loading : alarms.loading;
  const refresh = () => home ? subscriptions.refresh() : Promise.all([alarms.refresh(), subscriptions.refresh()]);
  return <SafeAreaView style={styles.screen} edges={['left', 'right']}>
    <FlatList data={data} keyExtractor={alarmId} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />}
      ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 16 }}>
        <Text accessibilityRole="header" style={styles.title}>{home ? 'Your alarm feed' : 'Discover alarms'}</Text>
        <Text style={styles.muted}>{home ? 'Updates from the alarms you follow.' : 'Choose the alarms you want to follow. You can change these at any time.'}</Text>
        {!home && <Feedback message={alarms.error} onRetry={alarms.refresh} />}
        <Feedback message={subscriptions.error} onRetry={subscriptions.refresh} />
      </View>}
      ListEmptyComponent={loading ? <Loading /> : <Empty title={home ? 'No subscriptions yet' : 'No alarms available'}
        description={home ? 'Open Subscriptions to discover and follow alarms.' : 'Pull down to check for new alarms.'} />}
      renderItem={({ item }) => <SubscriptionCard alarm={item} onOpen={(id) => navigation.navigate('AlarmDetails', { alarmId: id })} />} />
  </SafeAreaView>;
}

export function AlarmDetailsScreen({ route }) {
  const { api, session } = useAuth();
  const { alarmId: id } = route.params;
  const { toggle, isSubscribed, pending, loading: subscriptionsLoading, error: subscriptionError, refresh } = useSubscriptions();
  const [alarm, setAlarm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const attempt = ++generation.current;
    setAlarm(null);
    setLoading(true);
    setError('');
    try {
      const result = await api(`/api/alarms/${encodeURIComponent(id)}`, { session });
      if (!result?.alarm) throw new Error('The server returned an invalid alarm.');
      if (generation.current === attempt) setAlarm(result.alarm);
    } catch (failure) {
      if (generation.current === attempt) setError(failure.message);
    } finally {
      if (generation.current === attempt) setLoading(false);
    }
  }, [api, session.id, id]);
  useEffect(() => { load(); return () => { generation.current += 1; }; }, [load]);
  const location = typeof alarm?.location === 'string' ? alarm.location : alarm?.location?.name || alarm?.location?.address;
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Feedback message={error} onRetry={load} />
      {loading && <Loading />}
      {alarm && <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{alarm.name || 'Germ alarm'}</Text>
        <Text style={styles.label}>Severity: {alarm.severity || 'low'}</Text>
        {!!location && <Text style={styles.muted}>{location}</Text>}
        <Text style={styles.body}>{alarm.description || 'No further details are available.'}</Text>
        <Feedback message={subscriptionError} onRetry={refresh} />
        <Button title={pending[id] ? 'Updating…' : isSubscribed(id) ? 'Unsubscribe' : 'Subscribe'}
          secondary={isSubscribed(id)} disabled={!!pending[id] || subscriptionsLoading || !!subscriptionError}
          onPress={() => toggle(alarm)} />
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
