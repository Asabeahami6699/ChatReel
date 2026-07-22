import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  resolvePlayableAudioSource,
  safePlayAudioPlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from './appAudio';

const CALL_END_SOUND = require('../../assets/sounds/call-end.mp3');

let lastPlayedAt = 0;
const DEBOUNCE_MS = 1200;

let warmPlayer: AudioPlayer | null = null;
let warmSource: number | string | { uri: string } | null = null;
let preloadPromise: Promise<void> | null = null;

async function ensureWarmPlayer(): Promise<AudioPlayer | null> {
  if (warmPlayer) return warmPlayer;
  if (!preloadPromise) {
    preloadPromise = (async () => {
      try {
        // Warm audio mode + asset while the call is still up so hangup can play instantly.
        await configurePlaybackAudio();
        warmSource = await resolvePlayableAudioSource(CALL_END_SOUND);
        if (!warmPlayer) {
          warmPlayer = createPlaybackPlayer(warmSource);
          warmPlayer.loop = false;
        }
      } catch (err) {
        console.warn('[playCallEndTone] preload failed', err);
        preloadPromise = null;
      }
    })();
  }
  await preloadPromise;
  return warmPlayer;
}

/** Call when entering a call UI so hangup can play without download/setup delay. */
export function preloadCallEndTone(): void {
  void ensureWarmPlayer();
}

/**
 * Play the one-shot call-ended tone (local hangup and remote end).
 * Prefers a preloaded player so sound starts immediately.
 */
export function playCallEndTone(): void {
  const now = Date.now();
  if (now - lastPlayedAt < DEBOUNCE_MS) return;
  lastPlayedAt = now;

  void (async () => {
    let player: AudioPlayer | null = null;
    let createdEphemeral = false;
    try {
      player = await ensureWarmPlayer();
      if (!player) {
        await configurePlaybackAudio();
        const source = warmSource ?? (await resolvePlayableAudioSource(CALL_END_SOUND));
        player = createPlaybackPlayer(source);
        player.loop = false;
        createdEphemeral = true;
      }

      // Re-apply playback routing quickly; don't block first play attempt if already warm.
      void configurePlaybackAudio().catch(() => undefined);

      await seekPlaybackPlayer(player, 0);
      const ok = await safePlayAudioPlayer(player);
      if (!ok) {
        if (createdEphemeral) await releasePlayer(player);
        return;
      }

      const durationMs = Math.max(
        600,
        Math.round(((player as { duration?: number }).duration || 1.0) * 1000) + 150
      );
      if (createdEphemeral) {
        setTimeout(() => {
          void releasePlayer(player);
        }, Math.min(durationMs, 4000));
      }
    } catch (err) {
      console.warn('[playCallEndTone] failed', err);
      if (createdEphemeral && player) void releasePlayer(player);
    }
  })();
}
