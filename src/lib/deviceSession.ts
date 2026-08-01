import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';
import { getInstallationId } from './installationId';

function deviceLabel(): string {
  const app = Constants.expoConfig?.name || 'ChatReel';
  if (Platform.OS === 'ios') return `${app} · iPhone`;
  if (Platform.OS === 'android') return `${app} · Android`;
  if (Platform.OS === 'web') return `${app} · Web`;
  return `${app} · ${Platform.OS}`;
}

function deviceName(): string {
  const anyConst = Constants as { deviceName?: string | null };
  return anyConst.deviceName || Platform.OS;
}

/** Register/refresh this install as an active login device. */
export async function registerCurrentDevice(): Promise<void> {
  try {
    const installationId = await getInstallationId();
    await api.accountSessions.register({
      installation_id: installationId,
      label: deviceLabel(),
      platform: Platform.OS,
      device_name: deviceName(),
    });
  } catch {
    /* offline / not signed in */
  }
}

/**
 * Heartbeat. Returns true if this device was remotely revoked and the app should sign out.
 */
export async function heartbeatCurrentDevice(): Promise<{ revoked: boolean; message?: string }> {
  try {
    const installationId = await getInstallationId();
    const res = await api.accountSessions.heartbeat(installationId);
    if (res.revoked) {
      return { revoked: true, message: res.message };
    }
    if (res.unknown) {
      await registerCurrentDevice();
    }
    return { revoked: false };
  } catch {
    return { revoked: false };
  }
}
