import { api, ApiError } from './api';
import { ensureCallMediaPermissions } from './ensureCallMediaPermissions';
import { showAppToast } from './appToast';
import {
  beginOutgoingConnecting,
  clearCallPip,
  getCallPipSnapshot,
} from '../screens/Call/callPipBridge';

const RINGING_FRESH_MS = 120_000;
const ACCEPTED_FRESH_MS = 8 * 60 * 1000;

/**
 * Soft client guard before starting a call.
 * Ends orphaned joined sessions, then starts. Supports call waiting on the callee side.
 */
export async function getCallBusyMessage(): Promise<string | null> {
  try {
    const { call, my_state } = await api.calls.active();
    if (!call || my_state !== 'joined') return null;
    const age = Date.now() - new Date(call.created_at).getTime();
    if (!Number.isFinite(age)) return null;
    if (call.status === 'accepted' && age < ACCEPTED_FRESH_MS) {
      return call.id;
    }
    if (call.status === 'ringing' && age < RINGING_FRESH_MS) {
      return call.id;
    }
  } catch {
    /* offline / transient — let start proceed; server will decide */
  }
  return null;
}

/** Start a call after busy + media permission checks. */
export async function startCallGuarded(
  data: {
    type: 'voice' | 'video';
    callee_id?: string;
    group_id?: string;
    metadata?: { reel_id?: string; source?: string; [key: string]: unknown };
  },
  peerHint?: { peerName?: string; peerAvatar?: string | null }
) {
  // Show outgoing chrome BEFORE the permission sheet so the physical device
  // never looks like the call did nothing.
  beginOutgoingConnecting({
    peerName: peerHint?.peerName,
    peerAvatar: peerHint?.peerAvatar,
    callType: data.type,
  });

  const permErr = await ensureCallMediaPermissions(data.type);
  if (permErr) {
    clearCallPip();
    throw new ApiError(permErr, 403);
  }

  const busyCallId = await getCallBusyMessage();
  if (busyCallId) {
    try {
      await api.calls.end(busyCallId);
    } catch {
      /* server start also clears own busy rows */
    }
  }

  try {
    const result = await api.calls.start(data);
    if (result.waiting_on_busy) {
      showAppToast("Ringing — they'll see call waiting and can put their other call on hold");
    }
    const liveKit = result.live_kit;
    const url = typeof liveKit?.url === 'string' ? liveKit.url.trim() : '';
    const token = typeof liveKit?.token === 'string' ? liveKit.token.trim() : '';
    if (!token || !/^wss?:\/\//i.test(url)) {
      clearCallPip();
      throw new ApiError(
        'Calling is misconfigured (invalid LiveKit URL/token). Check LIVEKIT_URL on the server.',
        503
      );
    }
    return {
      ...result,
      live_kit: { ...liveKit, url, token },
    };
  } catch (err) {
    const snap = getCallPipSnapshot();
    if (snap.connecting && !snap.token) {
      clearCallPip();
    }
    if (err instanceof ApiError) {
      if (err.status === 429 || /CALL_CONCURRENCY|Too many active calls/i.test(err.message)) {
        showAppToast('Too many active calls — end one first');
      } else if (err.status === 503 || /LIVEKIT_CAPACITY|capacity/i.test(err.message)) {
        showAppToast('Calling is at capacity — try again shortly');
      }
    }
    throw err;
  }
}
