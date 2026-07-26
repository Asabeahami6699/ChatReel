import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let currentBadge = 0;

/**
 * Sets the launcher / home-screen badge count (SMS-style unread).
 * iOS always supports a number. Android depends on the launcher
 * (Samsung, Xiaomi, etc. show numbers; Pixel often only a dot).
 */
export function setAppBadgeCount(totalUnread: number): void {
  const next = Math.max(0, Math.floor(totalUnread));
  currentBadge = next;
  if (Platform.OS === 'web') return;
  void Notifications.setBadgeCountAsync(next).catch(() => undefined);
}

/** Bump while a message push arrives and ChatList isn't the source of truth yet. */
export function bumpAppBadgeCount(delta = 1): void {
  setAppBadgeCount(currentBadge + delta);
}

export function getAppBadgeCount(): number {
  return currentBadge;
}

export async function clearAppBadge(): Promise<void> {
  currentBadge = 0;
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    /* ignore */
  }
}
