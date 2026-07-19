/** Force a one-shot incoming-call resync (push tap / Realtime reconnect). */

import type { CallDTO } from './api';

type Listener = (callId?: string) => void;

const listeners = new Set<Listener>();
let pendingCallId: string | null = null;
let pendingCallSnapshot: CallDTO | null = null;

export function requestIncomingCallResync(callId?: string, snapshot?: CallDTO | null) {
  if (callId) pendingCallId = callId;
  if (snapshot?.id) {
    pendingCallId = snapshot.id;
    pendingCallSnapshot = snapshot;
  }
  listeners.forEach((fn) => {
    try {
      fn(callId ?? snapshot?.id);
    } catch (e) {
      console.error('[callIncomingBridge] listener error:', e);
    }
  });
}

/** Peek without clearing — clear only after a successful fetch. */
export function peekPendingIncomingCallId(): string | null {
  return pendingCallId;
}

export function peekPendingIncomingCallSnapshot(): CallDTO | null {
  return pendingCallSnapshot;
}

export function clearPendingIncomingCallId(callId?: string) {
  if (!callId || pendingCallId === callId) {
    pendingCallId = null;
    pendingCallSnapshot = null;
  }
}

/** @deprecated Prefer peek + clear after success. */
export function consumePendingIncomingCallId(): string | null {
  const id = pendingCallId;
  pendingCallId = null;
  pendingCallSnapshot = null;
  return id;
}

export function subscribeIncomingCallResync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
