import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PENDING_KEY = '@pending_app_invite_ref';
const PROMPTED_KEY = '@app_invite_playstore_prompted';

/** Capture invite-a-friend `?ref=` (or similar) so we can prompt after login. */
export async function captureAppInviteFromUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    const parsed = new URL(url);
    const ref =
      parsed.searchParams.get('ref') ||
      parsed.searchParams.get('invite') ||
      parsed.searchParams.get('from');
    if (!ref) return;
    // Group invite tokens are hex paths under /invite/ — handled elsewhere.
    if (/\/invite\//i.test(parsed.pathname)) return;
    await AsyncStorage.setItem(PENDING_KEY, ref);
  } catch {
    /* ignore bad urls */
  }
}

export async function captureAppInviteFromWebLocation(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  await captureAppInviteFromUrl(window.location.href);
}

export async function consumePendingAppInviteRef(): Promise<string | null> {
  try {
    const ref = await AsyncStorage.getItem(PENDING_KEY);
    if (!ref) return null;
    await AsyncStorage.removeItem(PENDING_KEY);
    return ref;
  } catch {
    return null;
  }
}

export async function shouldPromptPlayStoreAfterInvite(): Promise<boolean> {
  // Native installs already have the app.
  if (Platform.OS !== 'web') return false;
  try {
    const already = await AsyncStorage.getItem(PROMPTED_KEY);
    if (already === '1') return false;
    const pending = await AsyncStorage.getItem(PENDING_KEY);
    if (pending) return true;
    // Fallback: still on an invite landing URL in this tab.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return Boolean(params.get('ref') || params.get('invite') || params.get('from'));
    }
    return false;
  } catch {
    return false;
  }
}

export async function markPlayStorePromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPTED_KEY, '1');
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export const PLAY_STORE_APP_URL =
  'https://play.google.com/store/apps/details?id=com.chatapp';
