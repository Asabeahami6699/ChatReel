import type { ReelSoundDTO } from './api';

export type ReelAudioExtractEvent =
  | { type: 'started' }
  | { type: 'done'; sound: ReelSoundDTO }
  | { type: 'error'; message: string };

type Listener = (event: ReelAudioExtractEvent) => void;

const listeners = new Set<Listener>();

export function subscribeReelAudioExtract(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitReelAudioExtract(event: ReelAudioExtractEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
