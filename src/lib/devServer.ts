import Constants from 'expo-constants';
import { Platform } from 'react-native';

type HostCarrier = { hostUri?: string; debuggerHost?: string };

function hostFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  const host = uri.split(':')[0]?.trim();
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

/** Metro dev server host, e.g. "192.168.1.5" from hostUri "192.168.1.5:8081". */
export function getDevServerHost(): string | null {
  const manifest = Constants.expoConfig as HostCarrier | null;
  const legacyManifest = Constants.manifest as HostCarrier | null;
  const expoGo = Constants.expoGoConfig as HostCarrier | undefined;

  const candidates = [
    manifest?.hostUri,
    expoGo?.debuggerHost,
    legacyManifest?.debuggerHost,
    process.env.EXPO_PUBLIC_DEV_API_HOST,
  ];

  for (const candidate of candidates) {
    const host = hostFromUri(candidate);
    if (host) return host;
  }

  return null;
}

function usesAdbReverse(): boolean {
  const flag = process.env.EXPO_PUBLIC_DEV_USE_ADB_REVERSE;
  return flag === '1' || flag === 'true';
}

/** Rewrite localhost API URLs so a physical device can reach the dev machine. */
export function normalizeDevApiUrl(url: string): string {
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) return url;

  if (Platform.OS === 'android') {
    // Android emulator maps host machine to 10.0.2.2
    if (!Constants.isDevice) {
      return url
        .replace('://localhost', '://10.0.2.2')
        .replace('://127.0.0.1', '://10.0.2.2');
    }
  }

  // USB + `npm run adb:reverse`: keep localhost so adb forwards phone → PC.
  if (usesAdbReverse()) {
    return url;
  }

  // Physical device: use the same LAN IP Metro uses (requires `expo start --lan`)
  const devHost = getDevServerHost();
  if (devHost) {
    return url.replace('://localhost', `://${devHost}`).replace('://127.0.0.1', `://${devHost}`);
  }

  if (__DEV__ && Constants.isDevice) {
    console.warn(
      '[config] API URL still points at localhost on a physical device. ' +
        'Use the same Wi-Fi as your PC, run `npm start` (includes --lan), or set EXPO_PUBLIC_DEV_API_HOST to your PC IP.'
    );
  }

  return url;
}
