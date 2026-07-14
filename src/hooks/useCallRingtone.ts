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
import { RINGTONE_CLIP_SEC } from '../lib/ringtoneTrim';
import { loadPersistedRingtoneBlob } from '../lib/persistRingtone';

const BUNDLED = {
  outgoing: require('../../assets/sounds/outgoing-ring.mp3'),
  incoming: require('../../assets/sounds/incoming-ring.mp3'),
} as const;

export type CallRingtoneKind = keyof typeof BUNDLED;

/**
 * Loops a ringtone while mounted. Incoming uses the user's chosen file (and
 * optional 1-minute favourite trim) when set; otherwise the bundled default.
 */
export function useCallRingtone(kind: CallRingtoneKind | null) {
  const { settings, updateSettings } = useChatSettings();
  const soundRef = useRef<AudioPlayer | null>(null);
  const customIncoming = settings.incomingRingtoneUri?.trim() || null;
  const trimStart = Math.max(0, settings.incomingRingtoneStartSec || 0);
  const trimEnd = settings.incomingRingtoneEndSec;

  // Upgrade stale blob: settings → recovered data URI from side storage.
  useEffect(() => {
    if (!customIncoming?.toLowerCase().startsWith('blob:')) return;
    let alive = true;
    void (async () => {
      const recovered = await loadPersistedRingtoneBlob();
      if (!alive) return;
      if (recovered?.startsWith('data:')) {
        await updateSettings({ incomingRingtoneUri: recovered });
        return;
      }
      // Dead blob with nothing to recover — clear so preview/UI stay honest.
      await updateSettings({
        incomingRingtoneUri: null,
        incomingRingtoneLabel: null,
        incomingRingtoneStartSec: 0,
        incomingRingtoneEndSec: null,
      });
    })();
    return () => {
      alive = false;
    };
  }, [customIncoming, updateSettings]);

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

        if (kind === 'incoming' && customIncoming && !customIncoming.toLowerCase().startsWith('blob:')) {
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
          }
        }

        // Last chance: recovered data URI while settings still had blob:.
        if (kind === 'incoming') {
          const recovered = await loadPersistedRingtoneBlob();
          if (recovered?.startsWith('data:')) {
            try {
              const end =
                typeof trimEnd === 'number' && trimEnd > trimStart
                  ? Math.min(trimEnd, trimStart + RINGTONE_CLIP_SEC)
                  : trimStart + RINGTONE_CLIP_SEC;
              await startTrimLoop(recovered, trimStart, Math.max(trimStart + 0.5, end));
              if (customIncoming !== recovered) {
                void updateSettings({ incomingRingtoneUri: recovered });
              }
              return;
            } catch {
              /* fall through to bundled */
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
