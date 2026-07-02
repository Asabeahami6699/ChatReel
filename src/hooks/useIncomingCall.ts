import { useCallback, useEffect, useState } from 'react';
import { api, type CallDTO } from '../lib/api';
import { useAuth } from './useAuth';
import { useRealtimeTopic } from './useRealtimeTopic';

/**
 * Returns the currently-ringing incoming call addressed to me, if any.
 * Polls `/api/calls/incoming` every second (works even when realtime is down).
 */
export function useIncomingCall(): CallDTO | null {
  const { user } = useAuth();
  const myAuthId = user?.id ?? null;
  const [incoming, setIncoming] = useState<CallDTO | null>(null);

  const refresh = useCallback(async () => {
    if (!myAuthId) {
      setIncoming(null);
      return;
    }
    try {
      const { call: ring } = await api.calls.incoming();
      if (!ring) {
        setIncoming(null);
        return;
      }
      const age = Date.now() - new Date(ring.created_at).getTime();
      const validDirect =
        ring.scope === 'direct' &&
        ring.callee_id === myAuthId &&
        ring.caller_id !== myAuthId;
      const validGroup = ring.scope === 'group' && ring.caller_id !== myAuthId;
      const validTarget = validDirect || validGroup;
      setIncoming(age < 35_000 && validTarget ? ring : null);
    } catch {
      /* keep last state on transient errors */
    }
  }, [myAuthId]);

  useEffect(() => {
    void refresh();
    if (!myAuthId) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [myAuthId, refresh]);

  useRealtimeTopic('calls', refresh);

  return incoming;
}
