import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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
import { RINGTONE_CLIP_SEC } from '../lib/ringtoneTrim';

const BUNDLED = {
  outgoing: require('../../assets/sounds/outgoing-ring.mp3'),
  incoming: require('../../assets/sounds/incoming-ring.mp3'),
} as const;

export type CallRingtoneKind = keyof typeof BUNDLED;

/** blob: URIs die on reload — never persist as incoming ringtone. */
function isFragileUri(uri: string | null): boolean {
  if (!uri) return false;
  return uri.trim().toLowerCase().startsWith('blob:');
}

/**
 * Loops a ringtone while mounted. Incoming uses the user's chosen file (and
 * optional 1-minute favourite trim) when set; otherwise the bundled default.
 * Soft-fails all play() rejections (web NotSupportedError) onto the bundled tone.
 */
export function useCallRingtone(kind: CallRingtoneKind | null) {
  const { settings, updateSettings } = useChatSettings();
  const soundRef = useRef<AudioPlayer | null>(null);
  const customIncomingRaw = settings.incomingRingtoneUri?.trim() || null;
  const customIncoming = isFragileUri(customIncomingRaw) ? null : customIncomingRaw;
  const trimStart = Math.max(0, settings.incomingRingtoneStartSec || 0);
  const trimEnd = settings.incomingRingtoneEndSec;

  // Drop stale blob/custom URIs that will crash HTMLAudioElement.
  useEffect(() => {
    if (!customIncomingRaw || !isFragileUri(customIncomingRaw)) return;
    void updateSettings({
      incomingRingtoneUri: null,
      incomingRingtoneLabel: null,
      incomingRingtoneStartSec: 0,
      incomingRingtoneEndSec: null,
    });
  }, [customIncomingRaw, updateSettings]);

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

    const startTrimLoop = async (source: string, startSec: number, endSec: number) => {
      const resolved = await resolvePlayableAudioSource(source);
      const player = createPlaybackPlayer(resolved);
      player.loop = false;
      if (!mounted) {
        await releasePlayer(player);
        return;
      }
      soundRef.current = player;
      await seekPlaybackPlayer(player, startSec);
      const ok = await safePlayAudioPlayer(player);
      if (!ok) {
        await releasePlayer(player);
        if (soundRef.current === player) soundRef.current = null;
        throw new Error('custom ringtone unsupported');
      }

      loopWatch = setInterval(() => {
        const p = soundRef.current;
        if (!p) return;
        const t = Number(p.currentTime) || 0;
        if (t < startSec - 0.05 || t >= endSec - 0.05) {
          void seekPlaybackPlayer(p, startSec).then(() => {
            void safePlayAudioPlayer(p);
          });
        }
      }, 180);
    };

    (async () => {
      try {
        await configurePlaybackAudio();

        if (kind === 'incoming' && customIncoming) {
          let end =
            typeof trimEnd === 'number' && trimEnd > trimStart
              ? trimEnd
              : trimStart + RINGTONE_CLIP_SEC;
          end = Math.min(end, trimStart + RINGTONE_CLIP_SEC);
          try {
            await startTrimLoop(customIncoming, trimStart, Math.max(trimStart + 0.5, end));
            return;
          } catch (customErr) {
            console.warn('[useCallRingtone] custom tone failed, using default', customErr);
            if (Platform.OS === 'web') {
              // Clear broken persisted URI so the next ring doesn't spam errors.
              void updateSettings({
                incomingRingtoneUri: null,
                incomingRingtoneLabel: null,
                incomingRingtoneStartSec: 0,
                incomingRingtoneEndSec: null,
              });
            }
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
  }, [kind, customIncoming, trimStart, trimEnd, updateSettings]);
}
