import type { CallHistoryItemDTO } from './api';
import { api } from './api';
import { sessionStorage } from './sessionStorage';
import { friendshipsToCallFriends, type CallFriendRow } from './callFriends';

export type CallsPrefetchCache = {
  calls: CallHistoryItemDTO[];
  friends: CallFriendRow[];
  callsEnabled: boolean | null;
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: CallsPrefetchCache | null = null;
let prefetchPromise: Promise<void> | null = null;

export function getCallsPrefetchCache(): CallsPrefetchCache | null {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    cache = null;
    return null;
  }
  return cache;
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
  cache = {
    calls: patch.calls ?? prev.calls,
    friends: patch.friends ?? prev.friends,
    callsEnabled: patch.callsEnabled ?? prev.callsEnabled,
    fetchedAt: patch.fetchedAt ?? Date.now(),
  };
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
