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

export function soundTrackDurationSec(sound: ReelSoundDTO, clipLenSec: number): number {
  return sound.duration_sec ?? Math.max(clipLenSec + 30, 60);
}

/** Default clip window on the full track — user drags to pick which section. */
export function defaultSoundRange(
  sound: ReelSoundDTO,
  clipLenSec: number
): { start: number; end: number } {
  return soundClipWindow(soundTrackDurationSec(sound, clipLenSec), clipLenSec, 0);
}

/** Fixed-length clip window; `startSec` chooses where on the full track to crop. */
export function soundClipWindow(
  trackLenSec: number,
  clipLenSec: number,
  startSec = 0
): { start: number; end: number } {
  const track = Math.max(clipLenSec, trackLenSec);
  const clip = Math.min(Math.max(clipLenSec, 1), track);
  const maxStart = Math.max(0, track - clip);
  const start = Math.max(0, Math.min(startSec, maxStart));
  return { start, end: start + clip };
}
