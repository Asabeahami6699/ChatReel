/** Force a one-shot incoming-call resync (push tap / Realtime reconnect). */

type Listener = (callId?: string) => void;

const listeners = new Set<Listener>();
let pendingCallId: string | null = null;

export function requestIncomingCallResync(callId?: string) {
  if (callId) pendingCallId = callId;
  listeners.forEach((fn) => {
    try {
      fn(callId);
    } catch (e) {
      console.error('[callIncomingBridge] listener error:', e);
    }
  });
}

/** Peek without clearing — clear only after a successful fetch. */
export function peekPendingIncomingCallId(): string | null {
  return pendingCallId;
}

export function clearPendingIncomingCallId(callId?: string) {
  if (!callId || pendingCallId === callId) pendingCallId = null;
}

/** @deprecated Prefer peek + clear after success. */
export function consumePendingIncomingCallId(): string | null {
  const id = pendingCallId;
  pendingCallId = null;
  return id;
}

export function subscribeIncomingCallResync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
