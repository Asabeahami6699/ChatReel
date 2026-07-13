import type { ReelDTO } from '../../lib/api';
import { prefetchReelNow, scheduleReelPrefetch } from './reelVideoCache';

const noopCached = (_reelId: string, _localUri: string) => {};

/**
 * TikTok-style profile prefetch: warm the tapped/visible reel immediately,
 * then cache the next window in the background so immersive open + swipe is instant.
 */
export function prefetchProfileFeed(reels: ReelDTO[], aroundIndex = 0) {
  if (!reels.length) return;
  const clamped = Math.max(0, Math.min(reels.length - 1, aroundIndex));
  const current = reels[clamped];
  if (current) prefetchReelNow(current, noopCached);
  scheduleReelPrefetch(reels, clamped, noopCached);
}

/** Prefetch a short window starting at the first visible grid tile. */
export function prefetchProfileGridWindow(reels: ReelDTO[], firstVisibleIndex: number) {
  if (!reels.length) return;
  prefetchProfileFeed(reels, Math.max(0, firstVisibleIndex));
}
