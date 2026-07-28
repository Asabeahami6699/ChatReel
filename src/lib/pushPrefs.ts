/**
 * Module-level push prefs so Notifications.setNotificationHandler
 * (registered at import time) can honor the settings toggle.
 */

let pushNotificationsEnabled = true;
let registeredExpoToken: string | null = null;

export function setPushNotificationsEnabled(enabled: boolean) {
  pushNotificationsEnabled = enabled;
}

export function getPushNotificationsEnabled(): boolean {
  return pushNotificationsEnabled;
}

export function setRegisteredExpoPushToken(token: string | null) {
  registeredExpoToken = token;
}

export function getRegisteredExpoPushToken(): string | null {
  return registeredExpoToken;
}
