import { REEL_PROGRESS_ZONE } from './reelVideoLayout';

/** App accent used across reels (matches ChatReel Blue). */
export const REEL_ACCENT = '#007AFF';

export const APP_NAME = 'ChatReel';

/** How long the end screen stays visible before the reel loops. */
export const REEL_END_SCREEN_MS = 5000;

/** Watermark slide duration when a reel starts / replays. */
export const REEL_WATERMARK_ANIM_MS = 1000;

/**
 * Position reel chrome relative to the bottom of the video frame.
 * The feed reel item already excludes the tab bar on mobile, so we only
 * need internal spacing — not tab-bar height again.
 */
export function reelBottomLayout(safeBottom = 0) {
  return {
    progressBottom: safeBottom,
    metaBottom: safeBottom + REEL_PROGRESS_ZONE,
  };
}
