import type { CallHistoryItemDTO } from './api';
import { api } from './api';
import { sessionStorage } from './sessionStorage';
import { friendshipsToCallFriends, type CallFriendRow } from './callFriends';
import {
  DISK_TTL_MS,
  getOfflineFeedMemory,
  hydrateOfflineFeed,
  MEMORY_TTL_MS,
  OFFLINE_FEED_KEYS,
  setOfflineFeedMemory,
} from './offlineFeedStore';

export type CallsPrefetchCache = {
  calls: CallHistoryItemDTO[];
  friends: CallFriendRow[];
  callsEnabled: boolean | null;
  fetchedAt: number;
};

let cache: CallsPrefetchCache | null = null;
let prefetchPromise: Promise<void> | null = null;
let hydrateStarted = false;

function ensureHydrated() {
  if (hydrateStarted) return;
  hydrateStarted = true;
  void hydrateOfflineFeed<Omit<CallsPrefetchCache, 'fetchedAt'>>(OFFLINE_FEED_KEYS.calls).then(
    (data) => {
      if (!data || cache) return;
      const disk = getOfflineFeedMemory<Omit<CallsPrefetchCache, 'fetchedAt'>>(
        OFFLINE_FEED_KEYS.calls,
        { allowStale: true }
      );
      cache = {
        calls: data.calls ?? [],
        friends: data.friends ?? [],
        callsEnabled: data.callsEnabled ?? null,
        fetchedAt: disk?.fetchedAt ?? Date.now(),
      };
    }
  );
}

ensureHydrated();

export function getCallsPrefetchCache(opts?: { allowStale?: boolean }): CallsPrefetchCache | null {
  ensureHydrated();
  if (cache) {
    const age = Date.now() - cache.fetchedAt;
    if (age <= MEMORY_TTL_MS) return cache;
    if (opts?.allowStale && age <= DISK_TTL_MS) return cache;
  }
  const disk = getOfflineFeedMemory<Omit<CallsPrefetchCache, 'fetchedAt'>>(OFFLINE_FEED_KEYS.calls, {
    allowStale: true,
  });
  if (disk?.data) {
    cache = {
      calls: disk.data.calls ?? [],
      friends: disk.data.friends ?? [],
      callsEnabled: disk.data.callsEnabled ?? null,
      fetchedAt: disk.fetchedAt,
    };
    if (opts?.allowStale || Date.now() - disk.fetchedAt <= MEMORY_TTL_MS) return cache;
  }
  return opts?.allowStale ? cache : null;
}

export function clearCallsPrefetchCache() {
  cache = null;
  prefetchPromise = null;
}

export function upsertCallsPrefetchCache(
  patch: Partial<Omit<CallsPrefetchCache, 'fetchedAt'>> & { fetchedAt?: number }
) {
  const prev = cache ?? {
    calls: [],
    friends: [],
    callsEnabled: null,
    fetchedAt: 0,
  };
  const fetchedAt = patch.fetchedAt ?? Date.now();
  cache = {
    calls: patch.calls ?? prev.calls,
    friends: patch.friends ?? prev.friends,
    callsEnabled: patch.callsEnabled ?? prev.callsEnabled,
    fetchedAt,
  };
  setOfflineFeedMemory(
    OFFLINE_FEED_KEYS.calls,
    {
      calls: cache.calls,
      friends: cache.friends,
      callsEnabled: cache.callsEnabled,
    },
    fetchedAt
  );
}

/**
 * Prefetch call history and friends after idle so the Calls tab opens faster.
 */
export function scheduleCallsPrefetch(delayMs = 400) {
  if (prefetchPromise) return prefetchPromise;

  prefetchPromise = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const session = await sessionStorage.load();
          if (!session?.access_token) return;

          // Don't load LiveKit at cold start — it is heavy; Calls tab / call start will import it.

          const [configRes, historyRes, friendsRes, profileRes] = await Promise.allSettled([
            api.calls.config(),
            api.calls.history(80),
            api.friendships.list('accepted'),
            api.profiles.me(),
          ]);

          const callsEnabled =
            configRes.status === 'fulfilled' ? configRes.value.enabled : null;
          const calls =
            historyRes.status === 'fulfilled' ? historyRes.value.calls : [];
          const friendships =
            friendsRes.status === 'fulfilled' ? friendsRes.value.friendships : [];
          const myProfileId =
            profileRes.status === 'fulfilled'
              ? (profileRes.value.profile?.id as string | undefined) ?? null
              : null;

          upsertCallsPrefetchCache({
            calls,
            friends: friendshipsToCallFriends(
              (friendships ?? []) as Record<string, unknown>[],
              myProfileId
            ),
            callsEnabled,
          });
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
