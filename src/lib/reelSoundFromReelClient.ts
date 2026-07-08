import { api, type ReelSoundDTO } from './api';

const inflight = new Map<string, Promise<ReelSoundDTO>>();

/** Deduped in-flight request — safe to call from multiple screens at once. */
export function fetchSoundFromReel(reelId: string): Promise<ReelSoundDTO> {
  const existing = inflight.get(reelId);
  if (existing) return existing;

  const task = api.reels
    .soundFromReel(reelId)
    .then((res) => res.sound)
    .finally(() => {
      inflight.delete(reelId);
    });

  inflight.set(reelId, task);
  return task;
}
