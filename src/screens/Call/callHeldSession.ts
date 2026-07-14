import type { CallDTO } from '../../lib/api';

export type HeldCallSession = {
  call: CallDTO;
  peerName?: string;
};

type Listener = (held: HeldCallSession | null) => void;

let held: HeldCallSession | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(held);
}

export function getHeldCallSession(): HeldCallSession | null {
  return held;
}

export function setHeldCallSession(next: HeldCallSession | null): void {
  held = next;
  emit();
}

export function clearHeldCallSession(): void {
  held = null;
  emit();
}

export function subscribeHeldCallSession(listener: Listener): () => void {
  listeners.add(listener);
  listener(held);
  return () => listeners.delete(listener);
}
