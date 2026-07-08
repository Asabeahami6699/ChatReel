import { useCallback, useRef, useState, type RefObject } from 'react';
import type { ReelDTO } from '../../lib/api';
import {
  isReelFullyCached,
  prefetchReelNow,
  resolveReelPlaybackUri,
  scheduleReelPrefetch,
} from './reelVideoCache';

/**
 * Hybrid prefetch: stream the current reel immediately, fully cache MP4s for
 * upcoming reels in the background. Pins playback URI per reel so a completed
 * download never swaps the source mid-playback.
 */
export function useReelVideoPrefetch(activeReelIdRef: RefObject<string | null>) {
  const [cacheVersion, setCacheVersion] = useState(0);
  const pinnedUris = useRef<Record<string, string>>({});

  const bumpCache = useCallback(() => {
    setCacheVersion((v) => v + 1);
  }, []);

  const markCached = useCallback(
    (reelId: string, _localUri: string) => {
      const activeId = activeReelIdRef.current;
      if (reelId !== activeId) {
        delete pinnedUris.current[reelId];
      }
      bumpCache();
    },
    [activeReelIdRef, bumpCache]
  );

  const resolveUri = useCallback(
    (reel: ReelDTO): string => {
      const cachedUri = resolveReelPlaybackUri(reel);
      if (isReelFullyCached(reel.id)) {
        pinnedUris.current[reel.id] = cachedUri;
        return cachedUri;
      }

      const pinned = pinnedUris.current[reel.id];
      if (pinned) return pinned;

      pinnedUris.current[reel.id] = cachedUri;
      return cachedUri;
    },
    [cacheVersion]
  );

  const clearPins = useCallback(() => {
    pinnedUris.current = {};
  }, []);

  const releasePin = useCallback((reelId: string) => {
    delete pinnedUris.current[reelId];
  }, []);

  const prefetchAround = useCallback(
    (reels: ReelDTO[], currentIndex: number) => {
      scheduleReelPrefetch(reels, currentIndex, markCached);
    },
    [markCached]
  );

  const warmReel = useCallback(
    (reel: ReelDTO) => {
      prefetchReelNow(reel, markCached);
    },
    [markCached]
  );

  return {
    resolveUri,
    prefetchAround,
    warmReel,
    clearPins,
    releasePin,
    isCached: isReelFullyCached,
  };
}
