import type { ReelDTO } from './api';
import { api } from './api';
import { prefetchReelNow } from '../screens/Reel/reelVideoCache';
import { sessionStorage } from './sessionStorage';

export type ReelsFeedCacheKey = 'feed' | 'following';

type CacheEntry = {
  reels: ReelDTO[];
  next_cursor: string | null;
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<ReelsFeedCacheKey, CacheEntry>();
let prefetchPromise: Promise<void> | null = null;

export function getReelsFeedCache(key: ReelsFeedCacheKey): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function setCache(key: ReelsFeedCacheKey, reels: ReelDTO[], next_cursor: string | null) {
  cache.set(key, { reels, next_cursor, fetchedAt: Date.now() });
}

export function upsertReelsFeedCache(key: ReelsFeedCacheKey, reels: ReelDTO[], next_cursor: string | null) {
  setCache(key, reels, next_cursor);
}

function warmFirstReels(reels: ReelDTO[]) {
  for (const reel of reels.slice(0, 3)) {
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

          const { reels, next_cursor } = await api.reels.feed({ limit: 50 });
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
