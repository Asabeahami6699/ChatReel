import type { ReelDTO } from './api';
import { api } from './api';
import { prefetchReelNow } from '../screens/Reel/reelVideoCache';
import { sessionStorage } from './sessionStorage';
import {
  DISK_TTL_MS,
  getOfflineFeedMemory,
  hydrateOfflineFeed,
  MEMORY_TTL_MS,
  OFFLINE_FEED_KEYS,
  setOfflineFeedMemory,
} from './offlineFeedStore';

export type ReelsFeedCacheKey = 'feed' | 'following' | 'public';

type CacheEntry = {
  reels: ReelDTO[];
  next_cursor: string | null;
  fetchedAt: number;
};

type DiskPayload = {
  reels: ReelDTO[];
  next_cursor: string | null;
};

const cache = new Map<ReelsFeedCacheKey, CacheEntry>();
let prefetchPromise: Promise<void> | null = null;
let hydrateStarted = false;

const KEY_MAP: Record<ReelsFeedCacheKey, string> = {
  feed: OFFLINE_FEED_KEYS.reelsFeed,
  following: OFFLINE_FEED_KEYS.reelsFollowing,
  public: OFFLINE_FEED_KEYS.reelsPublic,
};

function ensureHydrated() {
  if (hydrateStarted) return;
  hydrateStarted = true;
  (Object.keys(KEY_MAP) as ReelsFeedCacheKey[]).forEach((key) => {
    void hydrateOfflineFeed<DiskPayload>(KEY_MAP[key]).then((data) => {
      if (!data || cache.has(key)) return;
      const disk = getOfflineFeedMemory<DiskPayload>(KEY_MAP[key], { allowStale: true });
      cache.set(key, {
        reels: data.reels ?? [],
        next_cursor: data.next_cursor ?? null,
        fetchedAt: disk?.fetchedAt ?? Date.now(),
      });
    });
  });
}

ensureHydrated();

export function getReelsFeedCache(
  key: ReelsFeedCacheKey,
  opts?: { allowStale?: boolean }
): CacheEntry | null {
  ensureHydrated();
  const entry = cache.get(key);
  if (entry) {
    const age = Date.now() - entry.fetchedAt;
    if (age <= MEMORY_TTL_MS) return entry;
    if (opts?.allowStale && age <= DISK_TTL_MS) return entry;
  }
  const disk = getOfflineFeedMemory<DiskPayload>(KEY_MAP[key], { allowStale: true });
  if (disk?.data) {
    const next: CacheEntry = {
      reels: disk.data.reels ?? [],
      next_cursor: disk.data.next_cursor ?? null,
      fetchedAt: disk.fetchedAt,
    };
    cache.set(key, next);
    if (opts?.allowStale || Date.now() - disk.fetchedAt <= MEMORY_TTL_MS) return next;
  }
  return opts?.allowStale ? cache.get(key) ?? null : null;
}

function setCache(key: ReelsFeedCacheKey, reels: ReelDTO[], next_cursor: string | null) {
  const fetchedAt = Date.now();
  cache.set(key, { reels, next_cursor, fetchedAt });
  setOfflineFeedMemory(KEY_MAP[key], { reels, next_cursor }, fetchedAt);
}

export function upsertReelsFeedCache(
  key: ReelsFeedCacheKey,
  reels: ReelDTO[],
  next_cursor: string | null
) {
  setCache(key, reels, next_cursor);
}

function warmFirstReels(reels: ReelDTO[]) {
  for (const reel of reels.slice(0, 2)) {
    void prefetchReelNow(reel, () => undefined);
  }
}

/**
 * Prefetch the reels feed after app idle time so opening the Reels tab shows
 * content immediately without blocking initial app load.
 */
export function scheduleReelsFeedPrefetch(delayMs = 600) {
  if (prefetchPromise) return prefetchPromise;

  prefetchPromise = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const session = await sessionStorage.load();
          if (!session?.access_token) return;

          const { reels, next_cursor } = await api.reels.feed({ limit: 30 });
          if (reels.length > 0) {
            setCache('feed', reels, next_cursor ?? null);
            warmFirstReels(reels);
          }
        } catch {
          /* silent — ReelsScreen will fetch on mount */
        } finally {
          resolve();
        }
      })();
    }, delayMs);

    // Allow GC if never started (tests / fast unmount)
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as { unref?: () => void }).unref?.();
    }
  });

  return prefetchPromise;
}

export function invalidateReelsFeedCache(key?: ReelsFeedCacheKey) {
  if (key) cache.delete(key);
  else cache.clear();
}
