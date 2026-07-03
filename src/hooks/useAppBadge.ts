import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Syncs the app icon badge count with the total unread count.
 * Only runs on native platforms (iOS / Android).
 */
export function useAppBadge(totalUnread: number) {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.setBadgeCountAsync(Math.max(0, totalUnread)).catch(() => undefined);
  }, [totalUnread]);
}
