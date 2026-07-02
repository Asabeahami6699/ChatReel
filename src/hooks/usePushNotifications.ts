import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../lib/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getExpoProjectId(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export function usePushNotifications(userId: string | undefined) {
  const registeredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;

    let active = true;

    (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted' || !active) return;

      const projectId = getExpoProjectId();
      const tokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();

      const token = tokenResult.data;
      if (!token || !active) return;

      registeredToken.current = token;
      await api.notifications.registerToken({ token, platform: Platform.OS });
    })().catch((err) => {
      console.warn('[push] registration failed:', err);
    });

    return () => {
      active = false;
      const token = registeredToken.current;
      if (token) {
        api.notifications.unregisterToken(token).catch(() => undefined);
        registeredToken.current = null;
      }
    };
  }, [userId]);
}
