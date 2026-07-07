import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@chatreel/reel-settings-v1';

export type ReelSettings = {
  autoPlayOnWifi: boolean;
  dataSaver: boolean;
  allowDownloads: boolean;
  defaultVisibility: 'public' | 'friends' | 'private';
  whoCanComment: 'everyone' | 'friends' | 'off';
  whoCanDuet: 'everyone' | 'friends' | 'off';
  saveDraftsToDevice: boolean;
  mutedByDefault: boolean;
};

export const DEFAULT_REEL_SETTINGS: ReelSettings = {
  autoPlayOnWifi: true,
  dataSaver: false,
  allowDownloads: true,
  defaultVisibility: 'public',
  whoCanComment: 'everyone',
  whoCanDuet: 'everyone',
  saveDraftsToDevice: true,
  mutedByDefault: false,
};

export async function loadReelSettings(): Promise<ReelSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REEL_SETTINGS };
    return { ...DEFAULT_REEL_SETTINGS, ...(JSON.parse(raw) as Partial<ReelSettings>) };
  } catch {
    return { ...DEFAULT_REEL_SETTINGS };
  }
}

export async function saveReelSettings(patch: Partial<ReelSettings>): Promise<ReelSettings> {
  const current = await loadReelSettings();
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
