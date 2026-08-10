import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ApiError, api } from './api';
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

/** When the deployed API is older than this client, stop hammering /sessions/*. */
let sessionsApiUnavailableUntil = 0;
let sessionsCallInFlight: Promise<void> | null = null;

function markSessionsUnavailable(ms = 6 * 60 * 60 * 1000) {
  sessionsApiUnavailableUntil = Date.now() + ms;
}

export function sessionsApiReady(): boolean {
  return Date.now() >= sessionsApiUnavailableUntil;
}

function noteSessionsError(err: unknown) {
  if (err instanceof ApiError && (err.status === 404 || err.status === 501 || err.status >= 500)) {
    markSessionsUnavailable();
  }
}

/** Register/refresh this install as an active login device. */
export async function registerCurrentDevice(): Promise<void> {
  if (!sessionsApiReady()) return;
  if (sessionsCallInFlight) {
    await sessionsCallInFlight.catch(() => undefined);
    return;
  }
  sessionsCallInFlight = (async () => {
    try {
      const installationId = await getInstallationId();
      await api.accountSessions.register({
        installation_id: installationId,
        label: deviceLabel(),
        platform: Platform.OS,
        device_name: deviceName(),
      });
    } catch (err) {
      noteSessionsError(err);
      /* offline / not signed in / old API */
    }
  })();
  try {
    await sessionsCallInFlight;
  } finally {
    sessionsCallInFlight = null;
  }
}

/**
 * Heartbeat. Returns true if this device was remotely revoked and the app should sign out.
 */
export async function heartbeatCurrentDevice(): Promise<{ revoked: boolean; message?: string }> {
  if (!sessionsApiReady()) return { revoked: false };
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
  } catch (err) {
    noteSessionsError(err);
    return { revoked: false };
  }
}
