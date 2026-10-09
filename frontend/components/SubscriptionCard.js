import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, colors, styles } from './ui';
import { alarmId, useSubscriptions } from '../context/SubscriptionsContext';

const severityColors = { low: '#266853', medium: '#855D08', high: '#B53A17', critical: '#A61D3A' };

export function SubscriptionCard({ alarm, onOpen }) {
  const { isSubscribed, pending, loading, error, toggle } = useSubscriptions();
  const id = alarmId(alarm);
  const subscribed = isSubscribed(id);
  const severity = String(alarm.severity || 'low').toLowerCase();
  const location = typeof alarm.location === 'string' ? alarm.location
    : alarm.location?.name || alarm.location?.address;
  const name = alarm.name || 'Germ alarm';
  return <View style={styles.card}>
    <View style={styles.row}>
      <Text style={{ color: severityColors[severity] || colors.muted, fontSize: 13, fontWeight: '800' }}>
        {severity.toUpperCase()} SEVERITY
      </Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${name}`} onPress={() => onOpen(id)}>
      <Text style={styles.subtitle}>{name}</Text>
      {!!location && <Text style={styles.muted}>{location}</Text>}
      <Text style={styles.body} numberOfLines={3}>{alarm.description || 'Stay informed about this alarm.'}</Text>
      <Text style={{ color: colors.primary, marginTop: 8, fontWeight: '600' }}>View details →</Text>
    </Pressable>
    <Button title={pending[id] ? 'Updating…' : subscribed ? 'Unsubscribe' : 'Subscribe'}
      accessibilityLabel={`${subscribed ? 'Unsubscribe from' : 'Subscribe to'} ${name}`}
      secondary={subscribed} disabled={pending[id] || loading || !!error || !id} onPress={() => toggle(alarm)} />
  </View>;
}
