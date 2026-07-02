import { useEffect, useRef } from 'react';
import {
  configurePlaybackAudio,
  createLoopingPlayer,
  releasePlayer,
  type AudioPlayer,
} from '../lib/appAudio';

const SOURCES = {
  outgoing: require('../../assets/sounds/outgoing-ring.mp3'),
  incoming: require('../../assets/sounds/incoming-ring.mp3'),
} as const;

export type CallRingtoneKind = keyof typeof SOURCES;

/**
 * Loops a bundled ringtone while mounted. Stops and unloads on unmount.
 */
export function useCallRingtone(kind: CallRingtoneKind | null) {
  const soundRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    if (!kind) return;
    let mounted = true;

    (async () => {
      try {
        await configurePlaybackAudio();
        const player = createLoopingPlayer(SOURCES[kind]);
        if (!mounted) {
          await releasePlayer(player);
          return;
        }
        soundRef.current = player;
        player.play();
      } catch (err) {
        console.warn('[useCallRingtone] playback failed', err);
      }
    })();

    return () => {
      mounted = false;
      void releasePlayer(soundRef.current);
      soundRef.current = null;
    };
  }, [kind]);
}
