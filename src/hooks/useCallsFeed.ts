import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, api, type CallHistoryItemDTO } from '../lib/api';
import {
  getCallsPrefetchCache,
  upsertCallsPrefetchCache,
} from '../lib/callsPrefetch';
import { friendshipsToCallFriends, type CallFriendRow } from '../lib/callFriends';
import { useRealtimeTopic } from './useRealtimeTopic';
import { useAuth } from './useAuth';

export function useCallsFeed(myProfileId: string | null) {
  const { isAuthenticated } = useAuth();
  const cached = isAuthenticated ? getCallsPrefetchCache() : null;
  const [calls, setCalls] = useState<CallHistoryItemDTO[]>(() => cached?.calls ?? []);
  const [friends, setFriends] = useState<CallFriendRow[]>(() => cached?.friends ?? []);
  const [callsEnabled, setCallsEnabled] = useState<boolean | null>(
    () => cached?.callsEnabled ?? null
  );
  const [loading, setLoading] = useState(() =>
    isAuthenticated ? !(cached?.calls.length ?? 0) : false
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPayload = useCallback(
    (
      history: CallHistoryItemDTO[],
      nextFriends: CallFriendRow[],
      enabled: boolean | null
    ) => {
      setCalls(history);
      setFriends(nextFriends);
      setCallsEnabled(enabled);
      upsertCallsPrefetchCache({
        calls: history,
        friends: nextFriends,
        callsEnabled: enabled,
      });
    },
    []
  );

  const fetchBundle = useCallback(async () => {
    if (!isAuthenticated) return;
    const [configRes, historyRes, friendsRes] = await Promise.all([
      api.calls.config(),
      api.calls.history(80),
      myProfileId
        ? api.friendships.list('accepted')
        : Promise.resolve({ friendships: [] as Record<string, unknown>[] }),
    ]);
    const history = historyRes.calls;
    const nextFriends = friendshipsToCallFriends(
      friendsRes.friendships ?? [],
      myProfileId
    );
    applyPayload(history, nextFriends, configRes.enabled);
  }, [isAuthenticated, myProfileId, applyPayload]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isAuthenticated) {
        setCalls([]);
        setFriends([]);
        setCallsEnabled(null);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else if (!(getCallsPrefetchCache()?.calls.length ?? 0) && calls.length === 0) {
        setLoading(true);
      }
      setError(null);
      try {
        await fetchBundle();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to load call history';
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated, fetchBundle, calls.length]
  );

  const silentRefresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      await fetchBundle();
    } catch {
      /* ignore background refresh errors */
    }
  }, [isAuthenticated, fetchBundle]);

  const scheduleSilentRefresh = useCallback(() => {
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    safetyTimer.current = setTimeout(() => {
      safetyTimer.current = null;
      void silentRefresh();
    }, 800);
  }, [silentRefresh]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCalls([]);
      setFriends([]);
      setCallsEnabled(null);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }
    const entry = getCallsPrefetchCache();
    if (entry) {
      setCalls(entry.calls);
      setFriends(entry.friends);
      setCallsEnabled(entry.callsEnabled);
      setLoading(false);
      void silentRefresh();
      return;
    }
    void load();
  }, [isAuthenticated, load, silentRefresh]);

  useEffect(() => {
    if (!isAuthenticated || !myProfileId || friends.length > 0) return;
    void (async () => {
      try {
        const { friendships } = await api.friendships.list('accepted');
        const nextFriends = friendshipsToCallFriends(friendships ?? [], myProfileId);
        if (nextFriends.length === 0) return;
        setFriends(nextFriends);
        upsertCallsPrefetchCache({ friends: nextFriends });
      } catch {
        /* ignore */
      }
    })();
  }, [isAuthenticated, myProfileId, friends.length]);

  useRealtimeTopic('calls', () => scheduleSilentRefresh(), isAuthenticated);
  useRealtimeTopic('callParticipants', () => scheduleSilentRefresh(), isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void silentRefresh();
    });
    return () => {
      sub.remove();
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, [isAuthenticated, silentRefresh]);

  const refresh = useCallback(() => load(true), [load]);

  return {
    calls,
    friends,
    callsEnabled,
    loading,
    refreshing,
    error,
    refresh,
    reload: load,
  };
}
