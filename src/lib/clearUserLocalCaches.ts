import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLocalActiveChatFocus } from './activeChatFocus';
import { clearCallsPrefetchCache } from './callsPrefetch';
import { messageStorage } from '../utils/messageStorage';

/**
 * Drop per-user chat / calls caches on sign-out so the next account
 * never flashes someone else's inbox.
 */
export async function clearUserLocalCaches(userId: string | null | undefined): Promise<void> {
  try {
    setLocalActiveChatFocus(null);
    clearCallsPrefetchCache();
  } catch {
    /* ignore */
  }

  if (!userId) return;

  const exactKeys = [
    `@individual_chats:${userId}`,
    `@individual_chats_timestamp:${userId}`,
    `@groups_list_v2${userId}`,
    `@groups_list_timestamp_v2${userId}`,
    `@group_last_messages_v2_${userId}`,
    `@user_profiles_cache_v2_${userId}`,
  ];

  try {
    await AsyncStorage.multiRemove(exactKeys);
  } catch {
    /* ignore */
  }

  // Native clears SQLite; web clears the legacy AsyncStorage message keys.
  try {
    await messageStorage.clearAll();
  } catch {
    /* ignore */
  }
}
