import { useEffect, useRef } from 'react';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../lib/appAudio';

export function mapOverlaySoundOffset(
  overlay: { startSec: number; endSec?: number },
  posSec: number,
  trimStart = 0
): number {
  const clipOffset = Math.max(0, posSec - trimStart);
  const segStart = overlay.startSec;
  const segEnd = overlay.endSec;
  if (segEnd != null && segEnd > segStart) {
    const segLen = segEnd - segStart;
    return segStart + (clipOffset % segLen);
  }
  return segStart + clipOffset;
}

type Options = {
  url: string | null | undefined;
  startSec: number;
  endSec?: number;
  trimStart?: number;
  playing: boolean;
  positionSec: number;
  volume?: number;
};

/** Looped overlay music synced to a video position (compose / preview). */
export function useOverlaySoundPlayback(opts: Options): void {
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await releasePlayer(playerRef.current);
      playerRef.current = null;
      if (!opts.url) return;
      await configurePlaybackAudio();
      if (!alive) return;
      playerRef.current = createPlaybackPlayer(opts.url);
    })();
    return () => {
      alive = false;
      void releasePlayer(playerRef.current);
      playerRef.current = null;
    };
  }, [opts.url]);

  useEffect(() => {
    const player = playerRef.current;
    if (!opts.url || !player) return;

    const offset = mapOverlaySoundOffset(
      { startSec: opts.startSec, endSec: opts.endSec },
      opts.positionSec,
      opts.trimStart ?? 0
    );

    try {
      player.volume = opts.volume ?? 1;
    } catch {
      /* volume may be unsupported */
    }

    if (opts.playing) {
      void seekPlaybackPlayer(player, offset).then(() => player.play());
    } else {
      player.pause();
    }
  }, [
    opts.url,
    opts.startSec,
    opts.endSec,
    opts.trimStart,
    opts.playing,
    opts.positionSec,
    opts.volume,
  ]);
}
