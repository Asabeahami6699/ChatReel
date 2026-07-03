import { useCallback, useEffect, useState } from 'react';
import { api, type CallDTO } from '../lib/api';
import { useAuth } from './useAuth';
import { useRealtimeTopic } from './useRealtimeTopic';

type ActiveCallState = {
  call: CallDTO | null;
  myState: string | null;
  joinedCount: number;
};

/**
 * Tracks an ongoing group call so chat members can join from an in-chat banner.
 */
export function useActiveGroupCall(groupId: string | undefined, enabled = true) {
  const { user } = useAuth();
  const [state, setState] = useState<ActiveCallState>({
    call: null,
    myState: null,
    joinedCount: 0,
  });

  const refresh = useCallback(async () => {
    if (!groupId || !user?.id) {
      setState({ call: null, myState: null, joinedCount: 0 });
      return;
    }
    try {
      const res = await api.calls.active(groupId);
      setState({
        call: res.call,
        myState: res.my_state,
        joinedCount: res.joined_count,
      });
    } catch {
      /* ignore transient errors */
    }
  }, [groupId, user?.id]);

  useEffect(() => {
    if (!enabled || !groupId) return;
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [enabled, groupId, refresh]);

  useRealtimeTopic('calls', refresh, Boolean(enabled && groupId && user?.id));
  useRealtimeTopic('callParticipants', refresh, Boolean(enabled && groupId && user?.id));

  const canJoin =
    !!state.call &&
    state.myState !== 'joined' &&
    ['ringing', 'accepted'].includes(state.call.status);

  return { ...state, canJoin, refresh };
}
