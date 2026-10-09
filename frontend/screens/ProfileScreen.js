import React from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSubscriptions } from '../context/SubscriptionsContext';
import { Button, Feedback, styles } from '../components/ui';

export function ProfileScreen() {
  const { session, logout, loggingOut, logoutError, pushState, enableNotifications } = useAuth();
  const { subscriptions } = useSubscriptions();
  const confirmLogout = () => Alert.alert('Sign out?', 'We will remove this device’s notification registration before signing you out.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: logout },
  ]);
  return <SafeAreaView style={styles.screen} edges={['left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Your profile</Text>
      <View style={styles.card}>
        <Text style={styles.subtitle}>{session.user.username}</Text>
        <Text style={styles.muted}>{session.user.email}</Text>
        <Text style={styles.body}>{subscriptions.length} alarm{subscriptions.length === 1 ? '' : 's'} followed</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.subtitle}>Device notifications</Text>
        <Text accessibilityLiveRegion="polite" style={styles.body}>{pushState.message}</Text>
        <Text style={styles.muted}>Remote push requires a physical device and a development or production build. Expo Go can still be used to browse and subscribe.</Text>
        <Button title={pushState.busy ? 'Enabling…' : 'Enable / retry notifications'}
          onPress={enableNotifications} disabled={pushState.busy || loggingOut} secondary />
      </View>
      <Feedback message={logoutError} onRetry={loggingOut ? undefined : logout} />
      <Button title={loggingOut ? 'Signing out…' : 'Sign out'} danger disabled={loggingOut || pushState.busy} onPress={confirmLogout} />
    </ScrollView>
  </SafeAreaView>;
}
