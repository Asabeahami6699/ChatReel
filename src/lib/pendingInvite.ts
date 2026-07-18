import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@pending_group_invite_token';

export async function setPendingInviteToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEY, token);
}

export async function consumePendingInviteToken(): Promise<string | null> {
  const token = await AsyncStorage.getItem(KEY);
  if (token) await AsyncStorage.removeItem(KEY);
  return token;
}
