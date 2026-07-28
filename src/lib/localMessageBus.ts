/**
 * Local-first message bus — UI observes storage writes instead of waiting on the network.
 */
export type LocalStoreEvent = {
  reason: 'messages' | 'index' | 'outbox' | 'clear' | 'sync';
  chatId?: string;
  chatType?: 'individual' | 'group';
};

type Listener = (event: LocalStoreEvent) => void;

const listeners = new Set<Listener>();

export function subscribeLocalStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyLocalStore(event: LocalStoreEvent): void {
  listeners.forEach((l) => {
    try {
      l(event);
    } catch (err) {
      console.warn('[localStore] listener error', err);
    }
  });
}
