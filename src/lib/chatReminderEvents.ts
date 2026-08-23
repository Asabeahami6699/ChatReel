/** Lightweight pub/sub so chat list refreshes when a reminder is created/updated. */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeChatRemindersChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitChatRemindersChanged(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
