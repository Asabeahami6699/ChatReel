/**
 * Stable per-install identifier.
 *
 * Persisted in SecureStore (via keyStore) with an AsyncStorage fallback so the
 * id survives app restarts AND sign-out (clearUserLocalCaches only removes
 * user-scoped cache keys). Generated once with a crypto-grade UUID where
 * available.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getSecretItem, setSecretItem } from './keyStore';

const SECURE_KEY = 'installation_id_v1';
const ASYNC_KEY = '@installation_id_v1';

let cachedId: string | null = null;
let pendingInit: Promise<string> | null = null;

function generateUuid(): string {
  try {
    if (typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  } catch {
    /* fall through */
  }
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* fall through */
  }
  // Last-resort v4-shaped fallback (non-crypto randomness).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidId(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length >= 8;
}

async function readPersistedId(): Promise<string | null> {
  try {
    const secure = await getSecretItem(SECURE_KEY);
    if (isValidId(secure)) return secure;
  } catch {
    /* fall through to AsyncStorage */
  }
  try {
    const fallback = await AsyncStorage.getItem(ASYNC_KEY);
    if (isValidId(fallback)) return fallback;
  } catch {
    /* ignore */
  }
  return null;
}

async function persistId(id: string): Promise<void> {
  try {
    await setSecretItem(SECURE_KEY, id);
  } catch {
    /* SecureStore unavailable — AsyncStorage below still persists it */
  }
  try {
    await AsyncStorage.setItem(ASYNC_KEY, id);
  } catch {
    /* ignore */
  }
}

async function initInstallationId(): Promise<string> {
  const existing = await readPersistedId();
  if (existing) {
    // Best-effort backfill so both stores agree going forward.
    void persistId(existing);
    return existing;
  }
  const id = generateUuid();
  await persistId(id);
  return id;
}

/**
 * Resolve the stable installation id. Concurrent callers share one
 * initialization promise; the resolved value is cached for the process.
 */
export async function getInstallationId(): Promise<string> {
  if (cachedId) return cachedId;
  if (!pendingInit) {
    pendingInit = initInstallationId()
      .then((id) => {
        cachedId = id;
        return id;
      })
      .catch((err) => {
        // Allow a retry on the next call instead of caching a rejection.
        pendingInit = null;
        throw err;
      });
  }
  return pendingInit;
}
