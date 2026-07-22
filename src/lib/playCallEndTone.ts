import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  resolvePlayableAudioSource,
  safePlayAudioPlayer,
} from './appAudio';

const CALL_END_SOUND = require('../../assets/sounds/call-end.mp3');

let lastPlayedAt = 0;
const DEBOUNCE_MS = 1500;

/**
 * Play the one-shot call-ended tone (both local hangup and remote end).
 * Fire-and-forget; safe to call from leave/end paths.
 */
export function playCallEndTone(): void {
  const now = Date.now();
  if (now - lastPlayedAt < DEBOUNCE_MS) return;
  lastPlayedAt = now;

  void (async () => {
    let player = null as ReturnType<typeof createPlaybackPlayer> | null;
    try {
      await configurePlaybackAudio();
      const source = await resolvePlayableAudioSource(CALL_END_SOUND);
      player = createPlaybackPlayer(source);
      player.loop = false;
      const ok = await safePlayAudioPlayer(player);
      if (!ok) {
        await releasePlayer(player);
        return;
      }
      // Release after the short clip finishes (or after a safety timeout).
      const durationMs = Math.max(
        800,
        Math.round(((player as { duration?: number }).duration || 1.2) * 1000) + 200
      );
      setTimeout(() => {
        void releasePlayer(player);
      }, Math.min(durationMs, 4000));
    } catch (err) {
      console.warn('[playCallEndTone] failed', err);
      if (player) void releasePlayer(player);
    }
  })();
}
