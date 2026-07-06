import { useEffect, useRef } from 'react';
import type { ReelDTO } from '../lib/api';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../lib/appAudio';
import { getReelMediaItems, isImageReelUrl } from '../lib/reelPlayback';

/** Photo reels keep music in a separate track — not muxed into the image file. */
export function reelNeedsOverlaySound(reel: ReelDTO): boolean {
  if (!reel.sound?.audio_url && !reel.sound?.preview_url) return false;
  const primary = getReelMediaItems(reel)[0];
  if (!primary) return isImageReelUrl(reel.video_url);
  return primary.media_type === 'image' || isImageReelUrl(primary.media_url);
}

type Options = {
  active: boolean;
  playing: boolean;
  muted: boolean;
  focused: boolean;
};

/**
 * Plays attached music for image reels while the slide is active.
 * Video reels with sound use muxed audio in the video file instead.
 */
export function useReelSoundPlayback(reel: ReelDTO | null | undefined, opts: Options): void {
  const playerRef = useRef<AudioPlayer | null>(null);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stopWatch = () => {
      if (watchRef.current) {
        clearInterval(watchRef.current);
        watchRef.current = null;
      }
    };

    const stopPlayer = async () => {
      stopWatch();
      await releasePlayer(playerRef.current);
      playerRef.current = null;
    };

    const shouldPlay =
      Boolean(reel) &&
      reelNeedsOverlaySound(reel!) &&
      opts.active &&
      opts.playing &&
      opts.focused &&
      !opts.muted;

    if (!shouldPlay || !reel?.sound) {
      void stopPlayer();
      return;
    }

    const sound = reel.sound;
    const startSec = Math.max(0, reel.sound_start_sec ?? 0);
    const clipSec = reel.duration && reel.duration > 0 ? reel.duration : 15;
    const endSec =
      sound.duration_sec != null && sound.duration_sec > startSec
        ? Math.min(startSec + clipSec, sound.duration_sec)
        : startSec + clipSec;
    const url = sound.preview_url ?? sound.audio_url;

    let alive = true;

    void (async () => {
      await stopPlayer();
      if (!alive) return;
      await configurePlaybackAudio();
      const player = createPlaybackPlayer(url);
      playerRef.current = player;
      await seekPlaybackPlayer(player, startSec);
      player.play();

      watchRef.current = setInterval(() => {
        const p = playerRef.current;
        if (!p) return;
        if (opts.muted || !opts.playing || !opts.focused) {
          p.pause();
          return;
        }
        const t = p.currentTime ?? 0;
        if (t >= endSec - 0.08) {
          void seekPlaybackPlayer(p, startSec).then(() => p.play());
        }
      }, 120);
    })();

    return () => {
      alive = false;
      void stopPlayer();
    };
  }, [
    reel,
    reel?.id,
    reel?.sound?.id,
    reel?.sound_start_sec,
    reel?.duration,
    opts.active,
    opts.playing,
    opts.muted,
    opts.focused,
  ]);
}
