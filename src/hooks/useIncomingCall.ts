import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, type CallDTO } from '../lib/api';
import { useAuth } from './useAuth';
import { useRealtimeTopic } from './useRealtimeTopic';

/** Poll interval when healthy — incoming calls rarely need sub-second checks. */
const POLL_MS = 5_000;
const MIN_GAP_MS = 2_500;
const MAX_BACKOFF_MS = 60_000;

/**
 * Returns the currently-ringing incoming call addressed to me, if any.
 * Polls `/api/calls/incoming` with backoff and pauses when the tab is hidden.
 */
export function useIncomingCall(): CallDTO | null {
  const { user } = useAuth();
  const myAuthId = user?.id ?? null;
  const [incoming, setIncoming] = useState<CallDTO | null>(null);
  const backoffRef = useRef(POLL_MS);
  const lastPollAtRef = useRef(0);

  const fetchIncoming = useCallback(async (): Promise<boolean> => {
    if (!myAuthId) {
      setIncoming(null);
      return true;
    }

    const now = Date.now();
    if (now - lastPollAtRef.current < MIN_GAP_MS) return true;
    lastPollAtRef.current = now;

    try {
      const { call: ring } = await api.calls.incoming();
      if (!ring) {
        setIncoming(null);
        return true;
      }
      const age = Date.now() - new Date(ring.created_at).getTime();
      const validDirect =
        ring.scope === 'direct' &&
        ring.callee_id === myAuthId &&
        ring.caller_id !== myAuthId;
      const validGroup = ring.scope === 'group' && ring.caller_id !== myAuthId;
      const validTarget = validDirect || validGroup;
      // Ringing calls: short window. Mid-call invites on accepted calls: always show.
      const isActiveInvite =
        ring.status === 'accepted' && ring.caller_id !== myAuthId;
      setIncoming(
        validTarget && (ring.status === 'ringing' ? age < 60_000 : isActiveInvite)
          ? ring
          : null
      );
      return true;
    } catch {
      return false;
    }
  }, [myAuthId]);

  useEffect(() => {
    if (!myAuthId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number) => {
      timer = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled) return;

      const hiddenOnWeb =
        Platform.OS === 'web' &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden';
      const inactive = AppState.currentState !== 'active';

      if (hiddenOnWeb || inactive) {
        schedule(10_000);
        return;
      }

      const ok = await fetchIncoming();
      if (ok) {
        backoffRef.current = POLL_MS;
        schedule(POLL_MS);
      } else {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        schedule(backoffRef.current);
      }
    };

    void tick();

    const onAppState = (state: string) => {
      if (state === 'active' && !cancelled) {
        clearTimeout(timer);
        backoffRef.current = POLL_MS;
        void tick();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [myAuthId, fetchIncoming]);

  const onRealtimeCalls = useCallback(() => {
    void fetchIncoming();
  }, [fetchIncoming]);

  useRealtimeTopic('calls', onRealtimeCalls);
  useRealtimeTopic('callParticipants', onRealtimeCalls);

  return incoming;
}
