/**
 * Thin helpers around expo-local-authentication for App Lock.
 */
import { Platform } from 'react-native';

export type AppLockAvailability = {
  available: boolean;
  reason?: string;
  biometricsLabel: string;
};

type LocalAuthModule = typeof import('expo-local-authentication');

function loadLocalAuth(): LocalAuthModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // Prefer sync require — more reliable with native modules in release/dev clients.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-local-authentication') as LocalAuthModule;
  } catch {
    return null;
  }
}

export async function getAppLockAvailability(): Promise<AppLockAvailability> {
  const LocalAuthentication = loadLocalAuth();
  if (!LocalAuthentication) {
    return {
      available: false,
      reason:
        'App lock needs a rebuilt ChatReel app that includes local authentication. Update/rebuild the app, then try again.',
      biometricsLabel: 'device lock',
    };
  }

  // Prefer enrolled security level: PIN/pattern alone counts (isEnrolledAsync is
  // biometric-oriented on some Android builds and falsely returns false).
  let level = LocalAuthentication.SecurityLevel.NONE;
  try {
    level = await LocalAuthentication.getEnrolledLevelAsync();
  } catch {
    level = LocalAuthentication.SecurityLevel.NONE;
  }

  const enrolledBiometrics = await LocalAuthentication.isEnrolledAsync().catch(() => false);
  const hasDeviceCredential = level > LocalAuthentication.SecurityLevel.NONE;

  if (!enrolledBiometrics && !hasDeviceCredential) {
    return {
      available: false,
      reason: 'Set up a screen lock (PIN, pattern, password, or biometrics) in system Settings first.',
      biometricsLabel: 'device lock',
    };
  }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []);
  const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const hasFinger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const biometricsLabel = hasFace
    ? Platform.OS === 'ios'
      ? 'Face ID'
      : 'face unlock'
    : hasFinger
      ? Platform.OS === 'ios'
        ? 'Touch ID'
        : 'fingerprint'
      : 'device lock';

  return { available: true, biometricsLabel };
}

export async function authenticateAppUnlock(promptMessage?: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const LocalAuthentication = loadLocalAuth();
  if (!LocalAuthentication) {
    return {
      success: false,
      error: 'App lock needs a rebuilt ChatReel app. Update the app and try again.',
    };
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage ?? 'Unlock ChatReel',
      cancelLabel: 'Cancel',
      // Allow PIN/pattern/password when biometrics aren’t enrolled or fail.
      disableDeviceFallback: false,
      fallbackLabel: 'Use passcode',
    });
    if (result.success) return { success: true };
    return {
      success: false,
      error: result.error === 'user_cancel' ? undefined : 'Authentication failed',
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Authentication failed',
    };
  }
}
