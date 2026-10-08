import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { colors } from '../../components/ui';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.text,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
    }}>
      <Tabs.Screen name="index" options={{
        title: 'My alarms',
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>◉</Text>,
      }} />
      <Tabs.Screen name="subscriptions" options={{
        title: 'Subscriptions',
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>≡</Text>,
      }} />
    </Tabs>
  );
}
