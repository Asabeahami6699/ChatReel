import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, type CallDTO } from '../lib/api';
import { useAuth } from './useAuth';
import { useRealtimeTopic } from './useRealtimeTopic';

const POLL_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Returns the currently-ringing incoming call addressed to me, if any.
 * Polls `/api/calls/incoming` (works even when realtime is down).
 * Backs off on network/CORS failures and pauses when the app tab is hidden.
 */
export function useIncomingCall(): CallDTO | null {
  const { user } = useAuth();
  const myAuthId = user?.id ?? null;
  const [incoming, setIncoming] = useState<CallDTO | null>(null);
  const backoffRef = useRef(POLL_MS);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!myAuthId) {
      setIncoming(null);
      return true;
    }
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
      setIncoming(age < 35_000 && validTarget ? ring : null);
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
        schedule(3000);
        return;
      }

      const ok = await refresh();
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
  }, [myAuthId, refresh]);

  useRealtimeTopic('calls', refresh);

  return incoming;
}
