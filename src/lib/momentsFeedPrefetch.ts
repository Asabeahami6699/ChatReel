import type { MomentAuthorFeedDTO } from './api';
import { api } from './api';
import { sessionStorage } from './sessionStorage';

type CacheEntry = {
  authors: MomentAuthorFeedDTO[];
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: CacheEntry | null = null;
let prefetchPromise: Promise<void> | null = null;

export function getMomentsFeedCache(): CacheEntry | null {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    cache = null;
    return null;
  }
  return cache;
}

export function upsertMomentsFeedCache(authors: MomentAuthorFeedDTO[]) {
  cache = { authors, fetchedAt: Date.now() };
}

/** Prefetch moments feed after idle so Explore → Moment opens with data ready. */
export function scheduleMomentsFeedPrefetch(delayMs = 2400) {
  if (prefetchPromise) return prefetchPromise;

  prefetchPromise = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const session = await sessionStorage.load();
          if (!session?.access_token) return;

          const { authors } = await api.moments.feed();
          if (authors.length > 0) {
            upsertMomentsFeedCache(authors);
          }
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
