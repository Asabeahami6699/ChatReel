import { Image } from 'react-native';
import type { MomentAuthorFeedDTO } from './api';
import { api } from './api';
import { getMomentVideoThumbnailUri } from './momentVideoThumbnail';
import { sessionStorage } from './sessionStorage';
import {
  DISK_TTL_MS,
  getOfflineFeedMemory,
  hydrateOfflineFeed,
  MEMORY_TTL_MS,
  OFFLINE_FEED_KEYS,
  setOfflineFeedMemory,
} from './offlineFeedStore';

type CacheEntry = {
  authors: MomentAuthorFeedDTO[];
  fetchedAt: number;
};

type ProfileCacheEntry = {
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
let profileCache: ProfileCacheEntry | null = null;
let prefetchPromise: Promise<void> | null = null;
let hydrateStarted = false;

function ensureHydrated() {
  if (hydrateStarted) return;
  hydrateStarted = true;
  void hydrateOfflineFeed<MomentAuthorFeedDTO[]>(OFFLINE_FEED_KEYS.moments).then((authors) => {
    if (!authors || cache) return;
    const disk = getOfflineFeedMemory<MomentAuthorFeedDTO[]>(OFFLINE_FEED_KEYS.moments, {
      allowStale: true,
    });
    cache = { authors, fetchedAt: disk?.fetchedAt ?? Date.now() };
  });
}

ensureHydrated();

export function getMomentsFeedCache(opts?: { allowStale?: boolean }): CacheEntry | null {
  ensureHydrated();
  if (cache) {
    const age = Date.now() - cache.fetchedAt;
    if (age <= MEMORY_TTL_MS) return cache;
    if (opts?.allowStale && age <= DISK_TTL_MS) return cache;
  }
  const disk = getOfflineFeedMemory<MomentAuthorFeedDTO[]>(OFFLINE_FEED_KEYS.moments, {
    allowStale: true,
  });
  if (disk?.data) {
    cache = { authors: disk.data, fetchedAt: disk.fetchedAt };
    if (opts?.allowStale || Date.now() - disk.fetchedAt <= MEMORY_TTL_MS) return cache;
  }
  return opts?.allowStale ? cache : null;
}

export function getExploreProfileCache(): ProfileCacheEntry | null {
  if (!profileCache) return null;
  if (Date.now() - profileCache.fetchedAt > MEMORY_TTL_MS) {
    profileCache = null;
    return null;
  }
  return profileCache;
}

export function upsertMomentsFeedCache(authors: MomentAuthorFeedDTO[]) {
  const fetchedAt = Date.now();
  cache = { authors, fetchedAt };
  setOfflineFeedMemory(OFFLINE_FEED_KEYS.moments, authors, fetchedAt);
}

function previewUriForSlide(slide: MomentAuthorFeedDTO['slides'][number]): string | null {
  if (slide.thumbnail_url) return slide.thumbnail_url;
  if (slide.media_type === 'image' && slide.media_url) return slide.media_url;
  if (slide.media_type === 'reel') {
    return slide.reel?.thumbnail_url ?? slide.media_url ?? null;
  }
  return null;
}

function warmMomentPreviews(authors: MomentAuthorFeedDTO[]) {
  let warmed = 0;
  const maxWarm = 28;

  for (const entry of authors) {
    if (entry.author.avatar_url) {
      void Image.prefetch(entry.author.avatar_url).catch(() => undefined);
    }

    for (const slide of entry.slides) {
      if (warmed >= maxWarm) return;

      const preview = previewUriForSlide(slide);
      if (preview) {
        warmed += 1;
        void Image.prefetch(preview).catch(() => undefined);
        continue;
      }

      if (slide.media_type === 'video' && slide.media_url) {
        warmed += 1;
        void getMomentVideoThumbnailUri(slide.id, slide.media_url).catch(() => undefined);
      }
    }
  }
}

function warmMomentViewerModule() {
  void import('../screens/Explore/MomentViewer').catch(() => undefined);
}

function warmExploreScreens() {
  void import('../screens/Explore/FeedScreen').catch(() => undefined);
  void import('../screens/Explore/MomentComposer').catch(() => undefined);
  warmMomentViewerModule();
}

/** Prefetch Explore (moments feed + avatars/previews + profile) after idle. */
export function scheduleMomentsFeedPrefetch(delayMs = 600) {
  if (prefetchPromise) return prefetchPromise;

  prefetchPromise = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const session = await sessionStorage.load();
          if (!session?.access_token) return;

          warmExploreScreens();

          const [feedRes, profileRes] = await Promise.allSettled([
            api.moments.feed(),
            api.profiles.me(),
          ]);

          if (feedRes.status === 'fulfilled') {
            upsertMomentsFeedCache(feedRes.value.authors);
            if (feedRes.value.authors.length > 0) {
              warmMomentPreviews(feedRes.value.authors);
            }
          }

          if (profileRes.status === 'fulfilled' && profileRes.value.profile) {
            const profile = profileRes.value.profile;
            profileCache = {
              display_name: (profile.display_name as string | null) ?? null,
              email: (profile.email as string | null) ?? null,
              avatar_url: (profile.avatar_url as string | null) ?? null,
              fetchedAt: Date.now(),
            };
            if (profileCache.avatar_url) {
              void Image.prefetch(profileCache.avatar_url).catch(() => undefined);
            }
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

export function scheduleExplorePrefetch(delayMs = 600) {
  return scheduleMomentsFeedPrefetch(delayMs);
}

/** Wait for in-flight Explore prefetch (or start one immediately). */
export function awaitExplorePrefetch(): Promise<void> {
  return prefetchPromise ?? scheduleExplorePrefetch(0);
}
