import { useEffect, useRef } from 'react';
import type { MomentSlideDTO, ReelDTO } from '../lib/api';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../lib/appAudio';
import { getReelMediaItems, isImageReelUrl } from '../lib/reelPlayback';

/** Minimal fields needed for overlay music playback (reels + moments). */
export type SoundPlaybackItem = Pick<
  ReelDTO,
  | 'sound'
  | 'sound_id'
  | 'sound_start_sec'
  | 'sound_volume'
  | 'original_audio_volume'
  | 'duration'
  | 'transcode_status'
  | 'hls_url'
  | 'video_url'
  | 'media'
>;

/** Photo reels never have baked audio — they always need overlay playback. */
export function reelIsImageReel(item: Pick<ReelDTO, 'video_url' | 'media'>): boolean {
  const items = getReelMediaItems(item as ReelDTO);
  return items.every(
    (m) => m.media_type === 'image' || isImageReelUrl(m.media_url)
  );
}

/** True when the published file already has music baked in (HLS or muxed MP4). */
export function reelHasMuxedSound(item: SoundPlaybackItem): boolean {
  if (reelIsImageReel(item)) return false;
  if (item.transcode_status === 'ready' && item.hls_url) return true;
  if (item.transcode_status === 'ready' && item.sound_id && !item.hls_url) return true;
  return false;
}

/**
 * Overlay music when the track is not muxed into the video (or photo posts).
 */
export function reelNeedsOverlaySound(item: SoundPlaybackItem | null | undefined): boolean {
  if (!item?.sound?.audio_url && !item?.sound?.preview_url) return false;
  if (reelIsImageReel(item)) return true;
  if (reelHasMuxedSound(item)) return false;
  return true;
}

/** Video player volume when overlay music is active (voice track). */
export function reelVideoVoiceVolume(item: SoundPlaybackItem, masterVolume: number): number {
  if (!reelNeedsOverlaySound(item)) return masterVolume;
  const voice = item.original_audio_volume ?? 1;
  return masterVolume * voice;
}

/** Moments never mux audio — map slide + clip length to reel-style playback source. */
export function momentToSoundPlayback(
  slide: MomentSlideDTO,
  clipSec: number
): SoundPlaybackItem {
  return {
    sound: slide.sound,
    sound_id: slide.sound_id,
    sound_start_sec: slide.sound_start_sec,
    sound_volume: slide.sound_volume,
    original_audio_volume: slide.original_audio_volume,
    duration: clipSec,
    transcode_status: 'pending',
    hls_url: null,
  };
}

type Options = {
  active: boolean;
  playing: boolean;
  muted: boolean;
  focused: boolean;
  masterVolume?: number;
};

const overlayStopHandlers = new Set<() => void>();

/** Hard-stop every overlay music player (leave Reels / open chat / background). */
export function stopAllReelOverlaySounds(): void {
  overlayStopHandlers.forEach((stop) => {
    try {
      stop();
    } catch {
      /* ignore */
    }
  });
}

/**
 * Plays attached music for image reels and video reels awaiting server mux.
 * Also used for moments via momentToSoundPlayback().
 */
export function useReelSoundPlayback(
  item: SoundPlaybackItem | null | undefined,
  opts: Options
): void {
  const playerRef = useRef<AudioPlayer | null>(null);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const genRef = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const stopWatch = () => {
      if (watchRef.current) {
        clearInterval(watchRef.current);
        watchRef.current = null;
      }
    };

    const stopPlayer = () => {
      stopWatch();
      const p = playerRef.current;
      playerRef.current = null;
      if (p) void releasePlayer(p);
    };

    overlayStopHandlers.add(stopPlayer);
    const myGen = ++genRef.current;

    const shouldPlay =
      Boolean(item) &&
      reelNeedsOverlaySound(item!) &&
      opts.active &&
      opts.playing &&
      opts.focused &&
      !opts.muted;

    if (!shouldPlay || !item?.sound) {
      stopPlayer();
      return () => {
        overlayStopHandlers.delete(stopPlayer);
        genRef.current += 1;
        stopPlayer();
      };
    }

    const sound = item.sound;
    const startSec = Math.max(0, item.sound_start_sec ?? 0);
    const clipSec = item.duration && item.duration > 0 ? item.duration : 15;
    const endSec =
      sound.duration_sec != null && sound.duration_sec > startSec
        ? Math.min(startSec + clipSec, sound.duration_sec)
        : startSec + clipSec;
    const url = sound.preview_url ?? sound.audio_url;
    const musicVol = (item.sound_volume ?? 0.45) * (opts.masterVolume ?? 1);

    void (async () => {
      stopPlayer();
      if (myGen !== genRef.current) return;
      await configurePlaybackAudio();
      if (myGen !== genRef.current) return;
      const player = createPlaybackPlayer(url);
      if (myGen !== genRef.current) {
        void releasePlayer(player);
        return;
      }
      try {
        player.volume = musicVol;
      } catch {
        /* volume may be unsupported on some builds */
      }
      playerRef.current = player;
      await seekPlaybackPlayer(player, startSec);
      if (myGen !== genRef.current) {
        void releasePlayer(player);
        if (playerRef.current === player) playerRef.current = null;
        return;
      }
      player.play();

      watchRef.current = setInterval(() => {
        const p = playerRef.current;
        if (!p) return;
        const live = optsRef.current;
        if (live.muted || !live.playing || !live.focused || !live.active) {
          try {
            p.pause();
          } catch {
            /* ignore */
          }
          return;
        }
        try {
          p.volume = musicVol;
        } catch {
          /* ignore */
        }
        const t = p.currentTime ?? 0;
        if (t >= endSec - 0.08) {
          void seekPlaybackPlayer(p, startSec).then(() => {
            if (myGen === genRef.current) p.play();
          });
        }
      }, 120);
    })();

    return () => {
      overlayStopHandlers.delete(stopPlayer);
      genRef.current += 1;
      stopPlayer();
    };
  }, [
    item,
    item?.sound?.id,
    item?.sound_start_sec,
    item?.sound_volume,
    item?.duration,
    item?.transcode_status,
    item?.hls_url,
    item?.sound_id,
    opts.active,
    opts.playing,
    opts.muted,
    opts.focused,
    opts.masterVolume,
  ]);
}
