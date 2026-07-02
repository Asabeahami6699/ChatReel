import { useCallback, useState } from 'react';
import type { ReelDTO } from '../../lib/api';
import { getCachedReelUri, prefetchReelNow, scheduleReelPrefetch } from './reelVideoCache';
import { getReelPlaybackUrl } from '../../lib/reelPlayback';

export function useReelVideoPrefetch() {
  const [cachedUris, setCachedUris] = useState<Record<string, string>>({});

  const markCached = useCallback((reelId: string, localUri: string) => {
    setCachedUris((prev) => {
      if (prev[reelId] === localUri) return prev;
      return { ...prev, [reelId]: localUri };
    });
  }, []);

  const resolveUri = useCallback(
    (reel: ReelDTO) => {
      const cached = cachedUris[reel.id] ?? getCachedReelUri(reel.id, reel.video_url);
      return getReelPlaybackUrl(reel, cached !== reel.video_url ? cached : undefined);
    },
    [cachedUris]
  );

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

  return { resolveUri, prefetchAround, warmReel, cachedUris };
}
