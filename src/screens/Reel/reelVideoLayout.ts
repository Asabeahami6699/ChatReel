import { Dimensions } from 'react-native';
import type { ReelDTO } from '../../lib/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Max width of the reel column on wide web layouts (TikTok / Shorts style). */
export const REEL_PHONE_MAX_WIDTH = 430;

export function getReelFrameDimensions(windowWidth: number, windowHeight: number) {
  return {
    frameWidth: windowWidth,
    frameHeight: windowHeight,
    usePhoneFrame: false,
    desktopActionOffset: 0,
  };
}

/** Space to keep captions from sitting under the right engagement column. */
export const REEL_ACTION_RAIL_WIDTH = 56;

/** Distance from the right screen edge to the engagement column (smaller = closer to edge). */
export const REEL_ACTION_RAIL_RIGHT = -2;

/** Height of the progress scrubber touch zone above the tab bar. */
export const REEL_PROGRESS_ZONE = 20;

/** Visible progress track height (pixels). */
export const REEL_PROGRESS_BAR_HEIGHT = 6;

/** Shift video + engagement down to cover the seam above the bottom nav. */
export const REEL_CONTENT_SHIFT_DOWN = 10;

/** Gap between caption/engagement row and the progress bar. */
export const REEL_META_GAP = 6;


/** Bottom inset so captions and the action rail sit just above the progress scrubber. */
export const REEL_BOTTOM_INSET = REEL_PROGRESS_ZONE + REEL_META_GAP;

/** Height of the reels bottom tab bar (icons only; safe area added separately). */
export const REEL_TAB_BAR_HEIGHT = 52;

const DEFAULT_ASPECT = 9 / 16;

export function getReelAspectRatio(reel: Pick<ReelDTO, 'width' | 'height'>): number {
  if (reel.width && reel.height && reel.width > 0 && reel.height > 0) {
    return reel.width / reel.height;
  }
  return DEFAULT_ASPECT;
}

/** Fit video inside a frame while preserving its aspect ratio (letterbox / pillarbox). */
export function getReelVideoLayout(
  reel: Pick<ReelDTO, 'width' | 'height'>,
  frameWidth: number,
  frameHeight: number
): { width: number; height: number } {
  const videoRatio = getReelAspectRatio(reel);
  const frameRatio = frameWidth / frameHeight;

  if (videoRatio >= frameRatio) {
    const width = frameWidth;
    return { width, height: width / videoRatio };
  }
  const height = frameHeight;
  return { width: height * videoRatio, height };
}

/** Size a preview box to fit inside max bounds without cropping. */
export function fitMediaInBounds(
  mediaWidth: number,
  mediaHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (mediaWidth <= 0 || mediaHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }
  const ratio = mediaWidth / mediaHeight;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

export { SCREEN_WIDTH, SCREEN_HEIGHT };
