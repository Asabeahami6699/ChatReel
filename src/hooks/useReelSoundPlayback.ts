import { useEffect, useRef } from 'react';
import type { ReelDTO } from '../lib/api';
import { getReelMediaItems, isImageReelUrl } from '../lib/reelPlayback';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../lib/appAudio';

/** True when the published file already has music baked in (HLS or muxed MP4). */
export function reelHasMuxedSound(reel: ReelDTO): boolean {
  if (reel.transcode_status === 'ready' && reel.hls_url) return true;
  if (reel.transcode_status === 'ready' && reel.sound_id && !reel.hls_url) return true;
  return false;
}

/**
 * Overlay music when the reel has a sound track that is not yet muxed into the video,
 * or for photo reels (music is always separate).
 */
export function reelNeedsOverlaySound(reel: ReelDTO): boolean {
  if (!reel.sound?.audio_url && !reel.sound?.preview_url) return false;
  if (reelHasMuxedSound(reel)) return false;
  return true;
}

/** Video player volume when overlay music is active (voice track). */
export function reelVideoVoiceVolume(reel: ReelDTO, masterVolume: number): number {
  if (!reelNeedsOverlaySound(reel)) return masterVolume;
  const voice = reel.original_audio_volume ?? 1;
  return masterVolume * voice;
}

type Options = {
  active: boolean;
  playing: boolean;
  muted: boolean;
  focused: boolean;
  masterVolume?: number;
};

/**
 * Plays attached music for image reels and video reels awaiting server mux.
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
    const musicVol = (reel.sound_volume ?? 0.45) * (opts.masterVolume ?? 1);

    let alive = true;

    void (async () => {
      await stopPlayer();
      if (!alive) return;
      await configurePlaybackAudio();
      const player = createPlaybackPlayer(url);
      try {
        player.volume = musicVol;
      } catch {
        /* volume may be unsupported on some builds */
      }
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
        try {
          p.volume = musicVol;
        } catch {
          /* ignore */
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
    reel?.sound_volume,
    reel?.duration,
    reel?.transcode_status,
    reel?.hls_url,
    opts.active,
    opts.playing,
    opts.muted,
    opts.focused,
    opts.masterVolume,
  ]);
}
