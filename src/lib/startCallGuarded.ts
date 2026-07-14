import { api, ApiError } from './api';
import { ensureCallMediaPermissions } from './ensureCallMediaPermissions';

const RINGING_FRESH_MS = 120_000;
const ACCEPTED_FRESH_MS = 3 * 60 * 60 * 1000;

/**
 * Soft client guard before starting a call. Backend also enforces busy state.
 * Only treats an active *joined* call as busy (not a mere invite), and ignores
 * stale ringing/accepted rows so abandoned calls don't brick the call buttons.
 */
export async function getCallBusyMessage(): Promise<string | null> {
  try {
    const { call, my_state } = await api.calls.active();
    if (!call || my_state !== 'joined') return null;
    const age = Date.now() - new Date(call.created_at).getTime();
    if (!Number.isFinite(age)) return null;
    if (call.status === 'accepted' && age < ACCEPTED_FRESH_MS) {
      return 'You are already on a call. End it before starting another.';
    }
    if (call.status === 'ringing' && age < RINGING_FRESH_MS) {
      return 'You already have a call ringing. End it before starting another.';
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
}) {
  const permErr = await ensureCallMediaPermissions(data.type);
  if (permErr) {
    throw new ApiError(permErr, 403);
  }
  const busy = await getCallBusyMessage();
  if (busy) {
    throw new ApiError(busy, 409);
  }
  return api.calls.start(data);
}
