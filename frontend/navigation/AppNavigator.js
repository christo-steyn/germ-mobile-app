import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { AlarmsProvider, useAlarms } from '../context/AlarmsContext';
import { SubscriptionsProvider, useSubscriptions } from '../context/SubscriptionsContext';
import { Notifications } from '../utils/notifications';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SubscriptionsScreen } from '../screens/SubscriptionsScreen';
import { AlarmDetailsScreen } from '../screens/AlarmScreens';
import { ProfileScreen } from '../screens/ProfileScreen';
import { LoadingScreen } from '../components/LoadingScreen';
import { Button, Feedback, colors, styles } from '../components/ui';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();
const options = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.ink,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

export function AuthNavigator() {
  return <Stack.Navigator screenOptions={options}>
    <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in' }} />
    <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
  </Stack.Navigator>;
}

function TabNavigator() {
  return <Tabs.Navigator screenOptions={({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.surface },
    tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }} accessibilityElementsHidden>
      {route.name === 'Home' ? '⌂' : route.name === 'Subscriptions' ? '☷' : '○'}
    </Text>,
  })}>
    <Tabs.Screen name="Home" component={HomeScreen} />
    <Tabs.Screen name="Subscriptions" component={SubscriptionsScreen} />
    <Tabs.Screen name="Profile" component={ProfileScreen} />
  </Tabs.Navigator>;
}

function SignedInNavigator({ readyRevision }) {
  const { session } = useAuth();
  const { refresh: refreshAlarms } = useAlarms();
  const { refresh: refreshSubscriptions } = useSubscriptions();
  const pendingTap = useRef(null);
  const handled = useRef(new Set());
  const openResponse = (response) => {
    const request = response?.notification?.request;
    if (!request || handled.current.has(request.identifier)) return;
    const id = request.content?.data?.alarmId;
    if ((typeof id !== 'string' && typeof id !== 'number') || !String(id)) return;
    // Cold-start responses from another account must never cross session boundaries.
    const recipient = request.content?.data?.userId;
    if (recipient !== undefined && String(recipient) !== String(session.user.id ?? session.user._id)) return;
    handled.current.add(request.identifier);
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
    if (navigationRef.isReady()) navigationRef.navigate('AlarmDetails', { alarmId: String(id) });
    else pendingTap.current = String(id);
  };
  useEffect(() => {
    let alive = true;
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const recipient = notification.request.content.data?.userId;
      if (alive && (recipient === undefined || String(recipient) === String(session.user.id ?? session.user._id))) {
        refreshAlarms();
        refreshSubscriptions();
      }
    });
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      if (alive) openResponse(response);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (alive) openResponse(response);
    }).catch(() => {});
    return () => {
      alive = false;
      received.remove();
      responseListener.remove();
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
  }, [session.id]);
  useEffect(() => {
    if (pendingTap.current && navigationRef.isReady()) {
      const id = pendingTap.current;
      pendingTap.current = null;
      navigationRef.navigate('AlarmDetails', { alarmId: id });
    }
  }, [readyRevision]);
  return <Stack.Navigator screenOptions={options}>
    <Stack.Screen name="Main" component={TabNavigator} options={{ title: 'Germ Alarm' }} />
    <Stack.Screen name="AlarmDetails" component={AlarmDetailsScreen} options={{ title: 'Alarm details' }} />
  </Stack.Navigator>;
}

export function AppNavigator() {
  const { session, restoring, restoreError, restore, discardRestore } = useAuth();
  const [readyRevision, setReadyRevision] = useState(0);
  if (restoring) return <LoadingScreen message="Restoring your session…" />;
  if (restoreError) return <SafeAreaView style={styles.screen}><View style={styles.content}>
    <Text style={styles.title}>Unable to reconnect</Text>
    <Feedback message={restoreError} onRetry={restore} />
    <Button title="Clear saved session and sign in" secondary onPress={discardRestore} />
  </View></SafeAreaView>;
  return <NavigationContainer ref={navigationRef} key={session?.id ?? 'signed-out'}
    onReady={() => setReadyRevision((value) => value + 1)}>
    {session ? <AlarmsProvider key={session.id}><SubscriptionsProvider>
      <SignedInNavigator readyRevision={readyRevision} />
    </SubscriptionsProvider></AlarmsProvider> : <AuthNavigator />}
  </NavigationContainer>;
}
