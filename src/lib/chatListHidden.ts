import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chat_list_hidden_v1';

export type ChatListEntryKind = 'individual' | 'group';

export function chatListKey(kind: ChatListEntryKind, id: string): string {
  return `${kind}:${id}`;
}

export async function loadHiddenChatKeys(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export async function saveHiddenChatKeys(keys: Set<string>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keys)));
}

export async function hideChatFromList(kind: ChatListEntryKind, id: string): Promise<Set<string>> {
  const keys = await loadHiddenChatKeys();
  keys.add(chatListKey(kind, id));
  await saveHiddenChatKeys(keys);
  return keys;
}

export async function unhideChatFromList(kind: ChatListEntryKind, id: string): Promise<Set<string>> {
  const keys = await loadHiddenChatKeys();
  keys.delete(chatListKey(kind, id));
  await saveHiddenChatKeys(keys);
  return keys;
}
