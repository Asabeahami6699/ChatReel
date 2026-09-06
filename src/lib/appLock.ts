/**
 * App Lock helpers — biometrics on native, PIN on web.
 */
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { getSecretItem, setSecretItem } from './keyStore';

export type AppLockAvailability = {
  available: boolean;
  reason?: string;
  biometricsLabel: string;
};

type LocalAuthModule = typeof import('expo-local-authentication');

const WEB_PIN_HASH_KEY = 'app_lock_web_pin_hash_v1';
const WEB_PIN_SALT_KEY = 'app_lock_web_pin_salt_v1';
const WEB_PIN_LEN_KEY = 'app_lock_web_pin_len_v1';

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

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function hasAppLockPin(): Promise<boolean> {
  const hash = await getSecretItem(WEB_PIN_HASH_KEY);
  return Boolean(hash);
}

export async function setAppLockPin(
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = pin.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 6) {
    return { ok: false, error: 'Use a 4–6 digit code.' };
  }
  const salt = Array.from(Crypto.getRandomBytes(16), (x) =>
    x.toString(16).padStart(2, '0')
  ).join('');
  const hash = await hashPin(digits, salt);
  await setSecretItem(WEB_PIN_SALT_KEY, salt);
  await setSecretItem(WEB_PIN_HASH_KEY, hash);
  await setSecretItem(WEB_PIN_LEN_KEY, String(digits.length));
  return { ok: true };
}

export async function verifyAppLockPin(pin: string): Promise<boolean> {
  const digits = pin.replace(/\D/g, '');
  if (!digits) return false;
  const [salt, hash] = await Promise.all([
    getSecretItem(WEB_PIN_SALT_KEY),
    getSecretItem(WEB_PIN_HASH_KEY),
  ]);
  if (!salt || !hash) return false;
  const attempt = await hashPin(digits, salt);
  return attempt === hash;
}

/** Stored digit count (4–6). Null for legacy PINs saved before length was stored. */
export async function getAppLockPinLength(): Promise<number | null> {
  const raw = await getSecretItem(WEB_PIN_LEN_KEY);
  const n = Number(raw);
  if (n >= 4 && n <= 6) return n;
  return null;
}

export async function clearAppLockPin(): Promise<void> {
  try {
    await setSecretItem(WEB_PIN_HASH_KEY, '');
    await setSecretItem(WEB_PIN_SALT_KEY, '');
    await setSecretItem(WEB_PIN_LEN_KEY, '');
  } catch {
    /* ignore */
  }
}

export async function getAppLockAvailability(): Promise<AppLockAvailability> {
  if (Platform.OS === 'web') {
    return {
      available: true,
      biometricsLabel: 'PIN code',
    };
  }

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

export async function authenticateAppUnlock(
  promptMessage?: string,
  pin?: string
): Promise<{
  success: boolean;
  error?: string;
  /** Web unlock needs a PIN from the gate UI. */
  needsPin?: boolean;
}> {
  if (Platform.OS === 'web') {
    if (!pin) {
      return { success: false, needsPin: true };
    }
    const digits = pin.replace(/\D/g, '');
    const ok = await verifyAppLockPin(digits);
    if (ok) {
      // Migrate legacy PINs so the pad can auto-submit at the right length.
      if (digits.length >= 4 && digits.length <= 6) {
        await setSecretItem(WEB_PIN_LEN_KEY, String(digits.length)).catch(() => undefined);
      }
      return { success: true };
    }
    return { success: false, error: 'Wrong code', needsPin: true };
  }

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
