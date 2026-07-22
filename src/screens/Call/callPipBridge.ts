/**
 * In-call session + floating PiP bridge.
 * Active call UI lives in ActiveCallLayer (outside the stack) so minimize
 * never unmounts LiveKit — Main stays tappable under a 1×1 media host.
 */

import type { CallDTO } from '../../lib/api';
import { api } from '../../lib/api';
import { leaveCallScreen } from '../../navigation/callSessionNav';
import { showAppToast } from '../../lib/appToast';
import { playCallEndTone, preloadCallEndTone } from '../../lib/playCallEndTone';

export type CallPipSnapshot = {
  active: boolean;
  minimized: boolean;
  callId: string | null;
  call: CallDTO | null;
  token: string | null;
  url: string | null;
  peerName: string;
  peerAvatar: string | null;
  durationLabel: string;
  elapsedSec: number;
  muted: boolean;
};

type Handlers = {
  onExpand: () => void;
  onToggleMute: () => void;
  onEnd: () => void;
};

type Listener = () => void;

let snapshot: CallPipSnapshot = {
  active: false,
  minimized: false,
  callId: null,
  call: null,
  token: null,
  url: null,
  peerName: 'Call',
  peerAvatar: null,
  durationLabel: '0:00',
  elapsedSec: 0,
  muted: false,
};

let handlers: Handlers | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.warn('[callPip]', e);
    }
  });
}

export function getCallPipSnapshot(): CallPipSnapshot {
  return snapshot;
}

export function subscribeCallPip(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerCallPipHandlers(next: Handlers | null) {
  handlers = next;
}

export function updateCallPip(partial: Partial<CallPipSnapshot>) {
  snapshot = { ...snapshot, ...partial };
  notify();
}

/** Open / replace the in-call session (LiveKit stays in ActiveCallLayer). */
export function openCallSession(params: {
  call: CallDTO;
  token: string;
  url: string;
  peerName?: string;
  peerAvatar?: string | null;
}) {
  preloadCallEndTone();
  snapshot = {
    ...snapshot,
    active: true,
    minimized: false,
    callId: params.call.id,
    call: params.call,
    token: params.token,
    url: params.url,
    peerName: params.peerName ?? snapshot.peerName,
    peerAvatar: params.peerAvatar !== undefined ? params.peerAvatar : snapshot.peerAvatar,
    durationLabel: '0:00',
    elapsedSec: 0,
    muted: false,
  };
  handlers = null;
  notify();
}

export function clearCallPip() {
  snapshot = {
    active: false,
    minimized: false,
    callId: null,
    call: null,
    token: null,
    url: null,
    peerName: 'Call',
    peerAvatar: null,
    durationLabel: '0:00',
    elapsedSec: 0,
    muted: false,
  };
  handlers = null;
  notify();
}

export function callPipExpand() {
  if (handlers?.onExpand) {
    handlers.onExpand();
    return;
  }
  updateCallPip({ minimized: false, active: true });
}

export function callPipToggleMute() {
  if (handlers?.onToggleMute) {
    handlers.onToggleMute();
    return;
  }
  updateCallPip({ muted: !snapshot.muted });
}

/** Hang up — prefer in-call handlers, else API end. */
export async function callPipEnd() {
  if (handlers?.onEnd) {
    handlers.onEnd();
    return;
  }
  playCallEndTone();
  const callId = snapshot.callId;
  clearCallPip();
  if (callId) {
    try {
      await api.calls.end(callId);
    } catch {
      /* ignore */
    }
  }
  showAppToast('Call ended');
  leaveCallScreen('Calls', null, { playEndTone: false });
}
