/**
 * Thin helpers around expo-local-authentication for App Lock.
 */
import { Platform } from 'react-native';

export type AppLockAvailability = {
  available: boolean;
  reason?: string;
  biometricsLabel: string;
};

async function loadLocalAuth(): Promise<typeof import('expo-local-authentication') | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-local-authentication');
  } catch {
    return null;
  }
}

export async function getAppLockAvailability(): Promise<AppLockAvailability> {
  const LocalAuthentication = await loadLocalAuth();
  if (!LocalAuthentication) {
    return {
      available: false,
      reason: 'App lock is only available on the mobile app.',
      biometricsLabel: 'device lock',
    };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    return {
      available: false,
      reason: 'This device does not support biometrics or a device passcode unlock.',
      biometricsLabel: 'device lock',
    };
  }

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    return {
      available: false,
      reason: 'Set up Face ID, fingerprint, or a device PIN in system Settings first.',
      biometricsLabel: 'device lock',
    };
  }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
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
  const LocalAuthentication = await loadLocalAuth();
  if (!LocalAuthentication) {
    return { success: false, error: 'App lock is only available on the mobile app.' };
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage ?? 'Unlock ChatReel',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      // Allow PIN/pattern/password when biometrics fail or aren’t used.
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
