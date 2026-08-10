import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@pending_reel_share_id';

export async function setPendingReelId(reelId: string): Promise<void> {
  await AsyncStorage.setItem(KEY, reelId);
}

export async function consumePendingReelId(): Promise<string | null> {
  const id = await AsyncStorage.getItem(KEY);
  if (id) await AsyncStorage.removeItem(KEY);
  return id;
}
