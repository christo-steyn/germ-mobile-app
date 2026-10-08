import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export const colors = {
  background: '#F3F6FA', surface: '#FFFFFF', ink: '#172B45', muted: '#53657A',
  primary: '#166455', border: '#D8E0E9', danger: '#AC2338',
};

export function Button({ title, onPress, disabled, secondary, danger, accessibilityLabel }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, danger && styles.danger, (disabled || pressed) && styles.dimmed]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

export function Feedback({ message, onRetry }) {
  if (!message) return null;
  return <View style={styles.feedback}>
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{message}</Text>
    {onRetry && <Button title="Try again" onPress={onRetry} secondary />}
  </View>;
}

export function Loading({ message = 'Loading…' }) {
  return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.muted}>{message}</Text></View>;
}

export function Empty({ title, description }) {
  return <View style={styles.empty}><Text style={styles.subtitle}>{title}</Text><Text style={styles.muted}>{description}</Text></View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 30, fontWeight: '800' },
  subtitle: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  secondary: { backgroundColor: '#E6F0ED', borderWidth: 1, borderColor: '#AEC8C0' },
  secondaryText: { color: '#164E43' },
  danger: { backgroundColor: colors.danger },
  dimmed: { opacity: 0.55 },
  feedback: { gap: 12, padding: 16, borderRadius: 12, backgroundColor: '#FFF1F2' },
  error: { color: colors.danger, fontSize: 15, lineHeight: 23 },
  loading: { padding: 30, alignItems: 'center', gap: 12 },
  empty: { paddingVertical: 36, alignItems: 'center', gap: 12 },
  label: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  field: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
});
