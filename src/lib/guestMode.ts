import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@chatreel_guest_mode_v1';

/** Persist "explore as guest" so Login only shows on first install and after sign-out. */
export async function loadGuestModePreferred(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setGuestModePreferred(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(KEY, '1');
    else await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
