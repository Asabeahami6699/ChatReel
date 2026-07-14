import { api, ApiError } from './api';
import { ensureCallMediaPermissions } from './ensureCallMediaPermissions';
import { showAppToast } from './appToast';

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
export async function startCallGuarded(data: {
  type: 'voice' | 'video';
  callee_id?: string;
  group_id?: string;
  metadata?: { reel_id?: string; source?: string; [key: string]: unknown };
}) {
  const permErr = await ensureCallMediaPermissions(data.type);
  if (permErr) {
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

  const result = await api.calls.start(data);
  if (result.waiting_on_busy) {
    showAppToast("Ringing — they'll see call waiting and can put their other call on hold");
  }
  return result;
}
