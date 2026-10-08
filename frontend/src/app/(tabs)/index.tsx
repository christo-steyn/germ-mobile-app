import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AlarmCard, Button, colors, ErrorNotice, styles } from '../../components/ui';
import { useAlarms } from '../../contexts/AlarmsContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePush } from '../../contexts/PushContext';

export default function HomeScreen() {
  const { session, logout } = useAuth();
  const { subscriptions, loading, error, pending, reload } = useAlarms();
  const push = usePush();
  const { alarmId } = useLocalSearchParams<{ alarmId?: string }>();
  const activeCount = subscriptions.filter(alarm => alarm.active).length;

  return (
    <ScrollView
      style={styles.screen} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} enabled={!pending.length} tintColor={colors.primary} />}
    >
      <Text style={styles.heading}>Hello, {session?.user.username}</Text>
      <Text style={styles.subtitle}>
        {subscriptions.length} subscribed · {activeCount} active right now
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Stay in the loop</Text>
        <Text style={styles.body}>{push.enabled
          ? 'Push notifications are enabled on this device.'
          : 'Enable push alerts to hear about the alarms you follow.'}</Text>
        <ErrorNotice message={push.error} />
        <Button
          title={push.enabled ? 'Refresh push registration' : 'Enable push notifications'}
          busy={push.busy} secondary={push.enabled} onPress={() => void push.enable()}
        />
        <Text style={styles.caption}>Requires a physical iOS or Android device and a development build with push credentials.</Text>
      </View>
      {push.notice && <View style={[styles.card, { backgroundColor: '#E8EEFF' }]}>
        <Text style={styles.label}>{push.notice}</Text>
      </View>}
      <ErrorNotice message={error} />
      {error && <Button title="Retry loading alarms" secondary disabled={!!pending.length} onPress={() => void reload()} />}
      {loading && !subscriptions.length && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading alarms" />}
      {!loading && !error && !subscriptions.length && <View style={styles.empty}>
        <Text style={styles.cardTitle}>No alarms yet</Text>
        <Text style={styles.subtitle}>Choose which alarms you want to follow.</Text>
        <Button title="Browse subscriptions" onPress={() => router.push('/subscriptions')} />
      </View>}
      {[...subscriptions].sort((a, b) => Number(b.id === Number(alarmId)) - Number(a.id === Number(alarmId)) ||
        Number(b.active) - Number(a.active)).map(alarm =>
        <AlarmCard key={alarm.id} alarm={alarm} highlighted={alarm.id === Number(alarmId)} />)}
      {!!alarmId && !loading && !error && !subscriptions.some(alarm => alarm.id === Number(alarmId)) &&
        <Text style={styles.caption}>This notification refers to an alarm you no longer follow. Browse subscriptions to find it.</Text>}
      <Button title="Sign out" secondary onPress={() => Alert.alert(
        'Sign out?', 'This device will stop receiving alerts for your account.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: logout }],
      )} />
    </ScrollView>
  );
}
