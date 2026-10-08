import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { AlarmsProvider } from '../contexts/AlarmsContext';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { PushProvider } from '../contexts/PushContext';

function Routes() {
  const { session, initializing } = useAuth();
  if (initializing) {
    return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Restoring your session" />
    </View>;
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AlarmsProvider>
          <PushProvider>
            <StatusBar style="dark" />
            <Routes />
          </PushProvider>
        </AlarmsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
