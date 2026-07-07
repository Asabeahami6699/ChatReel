import { useCallback, useEffect, useRef } from 'react';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../lib/appAudio';

export type OverlaySoundSpec = {
  url: string;
  startSec: number;
  endSec?: number;
} | null;

/** Looping overlay music for compose previews (reel image/video + moment). */
export function useOverlaySoundLoop(
  overlay: OverlaySoundSpec,
  clipLenSec: number,
  options?: { volume?: number; enabled?: boolean }
): void {
  const playerRef = useRef<AudioPlayer | null>(null);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volume = options?.volume ?? 1;
  const enabled = options?.enabled ?? true;

  const stopWatch = useCallback(() => {
    if (watchRef.current) {
      clearInterval(watchRef.current);
      watchRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    stopWatch();
    await releasePlayer(playerRef.current);
    playerRef.current = null;
  }, [stopWatch]);

  const start = useCallback(async () => {
    await stop();
    if (!overlay || !enabled) return;
    await configurePlaybackAudio();
    const player = createPlaybackPlayer(overlay.url);
    try {
      player.volume = volume;
    } catch {
      /* volume may be unsupported on some builds */
    }
    playerRef.current = player;
    await seekPlaybackPlayer(player, overlay.startSec);
    player.play();
    const end = overlay.endSec ?? overlay.startSec + clipLenSec;
    watchRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        p.volume = volume;
      } catch {
        /* ignore */
      }
      if ((p.currentTime ?? 0) >= end - 0.08) {
        void seekPlaybackPlayer(p, overlay.startSec).then(() => p.play());
      }
    }, 120);
  }, [clipLenSec, enabled, overlay, stop, volume]);

  useEffect(() => {
    if (overlay && enabled) void start();
    else void stop();
    return () => {
      void stop();
    };
  }, [enabled, overlay, start, stop]);
}
