import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export { Notifications };

export class NotificationSetupError extends Error {}

export async function registerPushToken() {
  if (Platform.OS === 'web') throw new NotificationSetupError('Remote notifications require the iOS or Android app.');
  if (Constants.executionEnvironment === 'storeClient') {
    throw new NotificationSetupError('Remote notifications are unavailable in Expo Go. Install a development build on a physical device.');
  }
  if (!Device.isDevice) throw new NotificationSetupError('Use a physical device to enable remote notifications.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new NotificationSetupError('Set EXPO_PUBLIC_EXPO_PROJECT_ID to your EAS project UUID and rebuild the app.');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alarms', {
      name: 'Germ alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new NotificationSetupError('Notifications are disabled. Enable them in device settings, then try again.');
  }
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  return result.data;
}
