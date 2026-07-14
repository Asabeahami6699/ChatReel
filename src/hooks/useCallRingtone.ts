import { useEffect, useRef } from 'react';
import {
  configurePlaybackAudio,
  createLoopingPlayer,
  createPlaybackPlayer,
  releasePlayer,
  resolvePlayableAudioSource,
  safePlayAudioPlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../lib/appAudio';
import { useChatSettings } from '../context/ChatSettingsContext';

const BUNDLED = {
  outgoing: require('../../assets/sounds/outgoing-ring.mp3'),
  incoming: require('../../assets/sounds/incoming-ring.mp3'),
} as const;

export type CallRingtoneKind = keyof typeof BUNDLED;

/**
 * Loops a ringtone while mounted. Incoming uses the selected library tone
 * (HTTPS URL from the server) when set; otherwise the bundled default.
 */
export function useCallRingtone(kind: CallRingtoneKind | null) {
  const { settings, refreshRingtoneLibrary } = useChatSettings();
  const soundRef = useRef<AudioPlayer | null>(null);
  const customIncoming = settings.incomingRingtoneUri?.trim() || null;

  useEffect(() => {
    if (kind === 'incoming') {
      void refreshRingtoneLibrary();
    }
  }, [kind, refreshRingtoneLibrary]);

  useEffect(() => {
    if (!kind) return;
    let mounted = true;
    let loopWatch: ReturnType<typeof setInterval> | null = null;

    const stopWatch = () => {
      if (loopWatch) {
        clearInterval(loopWatch);
        loopWatch = null;
      }
    };

    const playBundled = async (which: CallRingtoneKind) => {
      const resolved = await resolvePlayableAudioSource(BUNDLED[which]);
      const player = createLoopingPlayer(resolved);
      if (!mounted) {
        await releasePlayer(player);
        return;
      }
      soundRef.current = player;
      const ok = await safePlayAudioPlayer(player);
      if (!ok && mounted) {
        await releasePlayer(player);
        if (soundRef.current === player) soundRef.current = null;
      }
    };

    const playCustomLoop = async (source: string) => {
      const player = createPlaybackPlayer(source);
      player.loop = true;
      if (!mounted) {
        await releasePlayer(player);
        return;
      }
      soundRef.current = player;
      await seekPlaybackPlayer(player, 0);
      const ok = await safePlayAudioPlayer(player);
      if (!ok) {
        await releasePlayer(player);
        if (soundRef.current === player) soundRef.current = null;
        throw new Error('custom ringtone unsupported');
      }
    };

    (async () => {
      try {
        await configurePlaybackAudio();

        if (
          kind === 'incoming' &&
          customIncoming &&
          (customIncoming.startsWith('http') || customIncoming.startsWith('data:'))
        ) {
          try {
            await playCustomLoop(customIncoming);
            return;
          } catch (customErr) {
            console.warn('[useCallRingtone] custom tone failed, using default', customErr);
          }
        }

        await playBundled(kind);
      } catch (err) {
        console.warn('[useCallRingtone] playback failed', err);
        stopWatch();
        if (kind === 'incoming') {
          try {
            await playBundled('incoming');
          } catch (fallbackErr) {
            console.warn('[useCallRingtone] default fallback failed', fallbackErr);
          }
        }
      }
    })();

    return () => {
      mounted = false;
      stopWatch();
      void releasePlayer(soundRef.current);
      soundRef.current = null;
    };
  }, [kind, customIncoming]);
}
