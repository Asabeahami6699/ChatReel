import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatListKey, type ChatListEntryKind } from './chatListHidden';
import { notifyLocalStore } from './localMessageBus';

const STORAGE_KEY = 'chat_list_meta_v1';

export type ChatListMeta = {
  archived?: boolean;
  pinnedAt?: string | null;
  mutedUntil?: string | null;
};

type MetaMap = Record<string, ChatListMeta>;

async function readMap(): Promise<MetaMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MetaMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: MetaMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  notifyLocalStore({ reason: 'index' });
}

export async function loadChatListMeta(): Promise<MetaMap> {
  return readMap();
}

export async function patchChatListMeta(
  kind: ChatListEntryKind,
  id: string,
  patch: Partial<ChatListMeta>
): Promise<MetaMap> {
  const map = await readMap();
  const key = chatListKey(kind, id);
  const next = { ...(map[key] ?? {}), ...patch };
  if (!next.archived) delete next.archived;
  if (!next.pinnedAt) delete next.pinnedAt;
  if (!next.mutedUntil) delete next.mutedUntil;
  if (Object.keys(next).length === 0) delete map[key];
  else map[key] = next;
  await writeMap(map);
  return map;
}
