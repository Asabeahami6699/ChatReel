import { api, type GiftCatalogDTO } from './api';

let cachedGifts: GiftCatalogDTO[] | null = null;
let prefetchPromise: Promise<GiftCatalogDTO[]> | null = null;
let lastFetchedAt = 0;

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Return cached gift catalog if still fresh. */
export function getCachedGiftCatalog(): GiftCatalogDTO[] | null {
  if (!cachedGifts) return null;
  if (Date.now() - lastFetchedAt > CACHE_TTL_MS) return null;
  return cachedGifts;
}

/** Prefetch gift catalog in the background (does not block UI). */
export function scheduleGiftCatalogPrefetch(delayMs = 0): Promise<GiftCatalogDTO[]> {
  if (cachedGifts && Date.now() - lastFetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cachedGifts);
  }
  if (prefetchPromise) return prefetchPromise;

  prefetchPromise = new Promise<GiftCatalogDTO[]>((resolve) => {
    const run = () => {
      api.gifts
        .catalog()
        .then((res) => {
          cachedGifts = res.gifts ?? [];
          lastFetchedAt = Date.now();
          resolve(cachedGifts);
        })
        .catch(() => {
          resolve(cachedGifts ?? []);
        })
        .finally(() => {
          prefetchPromise = null;
        });
    };

    if (delayMs > 0) {
      setTimeout(run, delayMs);
    } else {
      // Defer past first paint so reel setup is never blocked.
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => run(), { timeout: 2500 });
      } else {
        setTimeout(run, 0);
      }
    }
  });

  return prefetchPromise;
}

/** Fetch catalog, preferring cache; refreshes in background when stale. */
export async function loadGiftCatalog(opts?: { force?: boolean }): Promise<GiftCatalogDTO[]> {
  const cached = getCachedGiftCatalog();
  if (cached && !opts?.force) {
    // Soft refresh without waiting.
    if (Date.now() - lastFetchedAt > CACHE_TTL_MS / 2) {
      void scheduleGiftCatalogPrefetch(0);
    }
    return cached;
  }
  return scheduleGiftCatalogPrefetch(0);
}
