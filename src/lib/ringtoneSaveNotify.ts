import type { UserRingtoneDTO } from './api';

export type RingtoneSaveEvent =
  | { type: 'started' }
  | { type: 'done'; ringtone: UserRingtoneDTO }
  | { type: 'error'; message: string };

type Listener = (event: RingtoneSaveEvent) => void;

const listeners = new Set<Listener>();

export function subscribeRingtoneSave(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRingtoneSave(event: RingtoneSaveEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
