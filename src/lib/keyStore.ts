import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Tiny key/value store for identity material.
 * Uses SecureStore on native; falls back to localStorage on web.
 */
async function webGet(key: string): Promise<string | null> {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function webSet(key: string, value: string): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export async function getSecretItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webGet(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return webGet(key);
  }
}

export async function setSecretItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await webSet(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await webSet(key, value);
  }
}

export function identityPrivateKeyId(userId: string) {
  return `id_${userId}`;
}

export function signedPrekeyPrivateKeyId(userId: string) {
  return `spk_${userId}`;
}
