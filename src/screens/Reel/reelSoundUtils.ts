import type { ReelSoundDTO } from '../../lib/api';

/** Default music clip length for photo posts (reels + moments). */
export const IMAGE_SOUND_CLIP_SEC = 15;

export function defaultSoundRange(
  sound: ReelSoundDTO,
  clipLenSec: number
): { start: number; end: number } {
  const trackLen = sound.duration_sec ?? Math.max(clipLenSec + 30, 60);
  const end = Math.min(trackLen, Math.max(clipLenSec, 1));
  return { start: 0, end };
}
