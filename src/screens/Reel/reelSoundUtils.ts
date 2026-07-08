import type { ReelDTO, ReelSoundDTO } from '../../lib/api';

/** Default music clip length for photo posts (reels + moments). */
export const IMAGE_SOUND_CLIP_SEC = 15;

export const REEL_SOUND_GENRES = [
  'afrobeats',
  'pop',
  'hip-hop',
  'chill',
  'electronic',
  'acoustic',
  'latin',
  'r&b',
] as const;

export function reelHasExtractableAudio(reel: ReelDTO): boolean {
  if (reel.sound) return true;
  if (reel.video_url) return true;
  return reel.media?.some((m) => m.media_type === 'video') ?? false;
}

export function defaultSoundRange(
  sound: ReelSoundDTO,
  clipLenSec: number
): { start: number; end: number } {
  const trackLen = sound.duration_sec ?? Math.max(clipLenSec + 30, 60);
  const end = Math.min(trackLen, Math.max(clipLenSec, 1));
  return { start: 0, end };
}
