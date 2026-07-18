import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, type CallDTO } from '../lib/api';
import {
  clearPendingIncomingCallId,
  peekPendingIncomingCallId,
  subscribeIncomingCallResync,
} from '../lib/callIncomingBridge';
import { useAuth } from './useAuth';
import { useRealtimeTopic } from './useRealtimeTopic';

/** Rare fallback — Realtime + push tap / focus are the primary paths. */
const FALLBACK_POLL_MS = 45_000;
const MIN_GAP_MS = 400;
const MAX_BACKOFF_MS = 60_000;

function isValidIncoming(ring: CallDTO, myAuthId: string): boolean {
  const age = Date.now() - new Date(ring.created_at).getTime();
  const validDirect =
    ring.scope === 'direct' &&
    ring.callee_id === myAuthId &&
    ring.caller_id !== myAuthId;
  const validGroup = ring.scope === 'group' && ring.caller_id !== myAuthId;
  const validTarget = validDirect || validGroup;
  const isActiveInvite =
    ring.status === 'accepted' && ring.caller_id !== myAuthId;
  return (
    validTarget && (ring.status === 'ringing' ? age < 60_000 : isActiveInvite)
  );
}

/**
 * Returns the currently-ringing incoming call addressed to me, if any.
 * Realtime-first; HTTP only for fetch/catch-up and a rare fallback poll.
 */
export function useIncomingCall(): CallDTO | null {
  const { user } = useAuth();
  const myAuthId = user?.id ?? null;
  const [incoming, setIncoming] = useState<CallDTO | null>(null);
  const backoffRef = useRef(FALLBACK_POLL_MS);
  const lastPollAtRef = useRef(0);

  const applyCall = useCallback(
    (ring: CallDTO | null) => {
      if (!myAuthId || !ring) {
        setIncoming(null);
        return;
      }
      setIncoming(isValidIncoming(ring, myAuthId) ? ring : null);
    },
    [myAuthId]
  );

  const fetchIncoming = useCallback(async (force = false): Promise<boolean> => {
    if (!myAuthId) {
      setIncoming(null);
      return true;
    }

    const now = Date.now();
    if (!force && now - lastPollAtRef.current < MIN_GAP_MS) return true;
    lastPollAtRef.current = now;

    try {
      const pendingId = peekPendingIncomingCallId();
      if (pendingId) {
        try {
          const { call } = await api.calls.get(pendingId);
          const c = call as CallDTO;
          if (isValidIncoming(c, myAuthId)) {
            clearPendingIncomingCallId(pendingId);
            setIncoming(c);
            return true;
          }
          // Stale / ended invite — drop so we don't retry forever.
          clearPendingIncomingCallId(pendingId);
        } catch {
          /* keep pending for next attempt; fall through to /incoming */
        }
      }

      const { call: ring } = await api.calls.incoming();
      applyCall(ring ?? null);
      return true;
    } catch {
      return false;
    }
  }, [myAuthId, applyCall]);

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
        schedule(FALLBACK_POLL_MS);
        return;
      }

      const ok = await fetchIncoming();
      if (ok) {
        backoffRef.current = FALLBACK_POLL_MS;
        schedule(FALLBACK_POLL_MS);
      } else {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        schedule(backoffRef.current);
      }
    };

    void tick();

    const onAppState = (state: string) => {
      if (state === 'active' && !cancelled) {
        clearTimeout(timer);
        backoffRef.current = FALLBACK_POLL_MS;
        lastPollAtRef.current = 0;
        void tick();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    const unsubBridge = subscribeIncomingCallResync(() => {
      lastPollAtRef.current = 0;
      void fetchIncoming(true);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.remove();
      unsubBridge();
    };
  }, [myAuthId, fetchIncoming]);

  const onRealtimeCalls = useCallback(() => {
    lastPollAtRef.current = 0;
    void fetchIncoming(true);
  }, [fetchIncoming]);

  useRealtimeTopic('calls', onRealtimeCalls);
  useRealtimeTopic('callParticipants', onRealtimeCalls);

  return incoming;
}
