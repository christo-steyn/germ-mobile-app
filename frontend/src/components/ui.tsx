import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alarm } from '../api';

export const colors = {
  background: '#F4F7FB', surface: '#FFFFFF', text: '#17243A', muted: '#64748B',
  primary: '#3057D5', line: '#DFE6F0', danger: '#AB2637', active: '#15734F',
};

export function Button({ title, onPress, disabled, secondary = false, busy = false }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button, secondary && styles.secondaryButton,
        (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 },
      ]}
    >
      {busy && <ActivityIndicator color={secondary ? colors.primary : '#FFFFFF'} />}
      <Text style={[styles.buttonText, secondary && { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function AlarmCard({ alarm, highlighted, children }: {
  alarm: Alarm; highlighted?: boolean; children?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, highlighted && { borderColor: colors.primary, borderWidth: 2 }]}>
      <View style={styles.row}>
        <Text style={[styles.cardTitle, { flex: 1 }]}>{alarm.name}</Text>
        <View style={[styles.badge, { backgroundColor: alarm.active ? '#E1F4EB' : '#EEF2F7' }]}>
          <Text style={{ color: alarm.active ? colors.active : colors.muted, fontWeight: '700', fontSize: 12 }}>
            {alarm.active ? 'ACTIVE' : 'INACTIVE'}
          </Text>
        </View>
      </View>
      {!!alarm.description && <Text style={styles.body}>{alarm.description}</Text>}
      <Text style={styles.caption}>Updated {new Date(alarm.updatedAt).toLocaleString()}</Text>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, flexGrow: 1 },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted, lineHeight: 24 },
  body: { fontSize: 15, color: colors.text, lineHeight: 23 },
  caption: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  card: { padding: 18, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  badge: { borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8 },
  button: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, minHeight: 48 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  secondaryButton: { backgroundColor: '#E8EEFF' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.text, fontSize: 16, minHeight: 50 },
  errorBox: { padding: 14, backgroundColor: '#FCECEE', borderRadius: 12 },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  empty: { paddingVertical: 30, alignItems: 'center', gap: 8 },
});
