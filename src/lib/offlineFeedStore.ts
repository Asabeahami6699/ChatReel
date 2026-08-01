/**
 * Persist lightweight feed JSON for offline Moments / Calls / Reels viewing.
 * Memory stays authoritative when fresh; disk is the offline fallback.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMORY_TTL_MS = 5 * 60 * 1000;
const DISK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Envelope<T> = {
  data: T;
  fetchedAt: number;
};

const memory = new Map<string, Envelope<unknown>>();

export async function hydrateOfflineFeed<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed?.fetchedAt || !parsed.data) return null;
    if (Date.now() - parsed.fetchedAt > DISK_TTL_MS) {
      void AsyncStorage.removeItem(key);
      return null;
    }
    memory.set(key, parsed as Envelope<unknown>);
    return parsed.data;
  } catch {
    return null;
  }
}

export function getOfflineFeedMemory<T>(
  key: string,
  opts?: { allowStale?: boolean }
): Envelope<T> | null {
  const entry = memory.get(key) as Envelope<T> | undefined;
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt;
  if (age > DISK_TTL_MS) {
    memory.delete(key);
    return null;
  }
  if (!opts?.allowStale && age > MEMORY_TTL_MS) return null;
  return entry;
}

export function setOfflineFeedMemory<T>(key: string, data: T, fetchedAt = Date.now()) {
  const envelope: Envelope<T> = { data, fetchedAt };
  memory.set(key, envelope as Envelope<unknown>);
  void AsyncStorage.setItem(key, JSON.stringify(envelope)).catch(() => undefined);
  return envelope;
}

export function clearOfflineFeedMemory(key?: string) {
  if (key) {
    memory.delete(key);
    void AsyncStorage.removeItem(key).catch(() => undefined);
    return;
  }
  const keys = [...memory.keys()];
  memory.clear();
  if (keys.length) void AsyncStorage.multiRemove(keys).catch(() => undefined);
}

export async function clearOfflineFeedKeys(keys: string[]) {
  for (const key of keys) memory.delete(key);
  if (keys.length) await AsyncStorage.multiRemove(keys).catch(() => undefined);
}

export const OFFLINE_FEED_KEYS = {
  moments: 'offline_feed_moments_v1',
  calls: 'offline_feed_calls_v1',
  friends: 'offline_feed_friends_accepted_v1',
  reelsFeed: 'offline_feed_reels_feed_v1',
  reelsFollowing: 'offline_feed_reels_following_v1',
  reelsPublic: 'offline_feed_reels_public_v1',
} as const;

export { MEMORY_TTL_MS, DISK_TTL_MS };
