import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { AlarmCard, Button, colors, ErrorNotice, styles } from '../../components/ui';
import { useAlarms } from '../../contexts/AlarmsContext';

export default function SubscriptionsScreen() {
  const { alarms, subscriptions, loading, pending, error, reload, toggle } = useAlarms();
  return (
    <ScrollView
      style={styles.screen} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} enabled={!pending.length} tintColor={colors.primary} />}
    >
      <Text style={styles.heading}>Choose your alarms</Text>
      <Text style={styles.subtitle}>Follow an alarm to see its status and receive push alerts when enabled.</Text>
      <ErrorNotice message={error} />
      {error && <Button title="Retry" secondary disabled={!!pending.length} onPress={() => void reload()} />}
      {loading && !alarms.length && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading subscriptions" />}
      {!loading && !error && !alarms.length && <View style={styles.empty}>
        <Text style={styles.cardTitle}>No alarms available</Text>
        <Text style={styles.subtitle}>Pull down to check again later.</Text>
      </View>}
      {alarms.map(alarm => {
        const subscribed = subscriptions.some(value => value.id === alarm.id);
        const saving = pending.includes(alarm.id);
        return <AlarmCard key={alarm.id} alarm={alarm}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{subscribed ? 'Subscribed' : 'Not subscribed'}</Text>
              {saving && <Text style={styles.caption}>Saving…</Text>}
            </View>
            {saving && <ActivityIndicator color={colors.primary} />}
            <Switch
              accessibilityLabel={`Subscribe to ${alarm.name}`}
              accessibilityState={{ checked: subscribed, disabled: saving || loading, busy: saving }}
              value={subscribed} disabled={saving || loading}
              onValueChange={() => void toggle(alarm.id)}
              trackColor={{ false: colors.line, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </AlarmCard>;
      })}
    </ScrollView>
  );
}
