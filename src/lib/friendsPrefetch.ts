/**
 * Prefetch accepted friends (same idea as the chat contact list) so Friends
 * opens instantly and works offline from disk cache.
 */
import { api } from './api';
import { sessionStorage } from './sessionStorage';
import {
  DISK_TTL_MS,
  getOfflineFeedMemory,
  hydrateOfflineFeed,
  MEMORY_TTL_MS,
  OFFLINE_FEED_KEYS,
  setOfflineFeedMemory,
} from './offlineFeedStore';

const STORAGE_KEY = OFFLINE_FEED_KEYS.friends;

export type AcceptedFriendRow = {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  avatar_url?: string;
};

type CachePayload = {
  friends: AcceptedFriendRow[];
};

type CacheEntry = CachePayload & { fetchedAt: number };

let cache: CacheEntry | null = null;
let prefetchPromise: Promise<void> | null = null;
let hydrateStarted = false;

function ensureHydrated() {
  if (hydrateStarted) return;
  hydrateStarted = true;
  void hydrateOfflineFeed<CachePayload>(STORAGE_KEY).then((data) => {
    if (!data || cache) return;
    const disk = getOfflineFeedMemory<CachePayload>(STORAGE_KEY, { allowStale: true });
    cache = {
      friends: data.friends ?? [],
      fetchedAt: disk?.fetchedAt ?? Date.now(),
    };
  });
}

ensureHydrated();

export function mapFriendshipsToRows(
  data: Record<string, unknown>[],
  myProfileId: string | null | undefined
): AcceptedFriendRow[] {
  if (!myProfileId) return [];
  const friends =
    data
      ?.map((f) => {
        const isSender = f.user_id === myProfileId;
        const profile = (isSender ? f.receiver_profile : f.sender_profile) as Record<
          string,
          unknown
        > | null;
        if (!profile) return null;
        return {
          id: f.id as string,
          user_id: (profile.user_id as string) || '',
          name: (profile.display_name as string) || (profile.email as string) || 'Unknown',
          email: profile.email as string | undefined,
          avatar_url: profile.avatar_url as string | undefined,
        };
      })
      .filter((f): f is AcceptedFriendRow => Boolean(f && f.user_id)) || [];

  return Array.from(new Map(friends.map((friend) => [friend.user_id, friend])).values());
}

export function getAcceptedFriendsCache(opts?: {
  allowStale?: boolean;
}): CacheEntry | null {
  ensureHydrated();
  if (cache) {
    const age = Date.now() - cache.fetchedAt;
    if (age <= MEMORY_TTL_MS) return cache;
    if (opts?.allowStale && age <= DISK_TTL_MS) return cache;
  }
  const disk = getOfflineFeedMemory<CachePayload>(STORAGE_KEY, { allowStale: true });
  if (disk?.data) {
    cache = {
      friends: disk.data.friends ?? [],
      fetchedAt: disk.fetchedAt,
    };
    if (opts?.allowStale || Date.now() - disk.fetchedAt <= MEMORY_TTL_MS) return cache;
  }
  return opts?.allowStale ? cache : null;
}

export function upsertAcceptedFriendsCache(friends: AcceptedFriendRow[]) {
  const fetchedAt = Date.now();
  cache = { friends, fetchedAt };
  setOfflineFeedMemory(STORAGE_KEY, { friends }, fetchedAt);
}

export function scheduleFriendsPrefetch(delayMs = 500) {
  if (prefetchPromise) return prefetchPromise;

  prefetchPromise = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const session = await sessionStorage.load();
          if (!session?.access_token) return;

          const [{ friendships }, me] = await Promise.all([
            api.friendships.list('accepted'),
            api.profiles.me().catch(() => null),
          ]);
          const myProfileId = (me?.profile?.id as string | undefined) ?? null;
          const rows = mapFriendshipsToRows(
            (friendships ?? []) as Record<string, unknown>[],
            myProfileId
          );
          upsertAcceptedFriendsCache(rows);
        } catch {
          /* silent */
        } finally {
          resolve();
        }
      })();
    }, delayMs);

    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as { unref?: () => void }).unref?.();
    }
  });

  return prefetchPromise;
}

export function clearAcceptedFriendsCache() {
  cache = null;
  prefetchPromise = null;
}
