/** Force an active/outgoing call row refresh after LiveKit reconnect. */

type Listener = (callId?: string) => void;

const listeners = new Set<Listener>();

export function requestCallRowResync(callId?: string) {
  listeners.forEach((fn) => {
    try {
      fn(callId);
    } catch (e) {
      console.error('[callRowResyncBridge] listener error:', e);
    }
  });
}

export function subscribeCallRowResync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
