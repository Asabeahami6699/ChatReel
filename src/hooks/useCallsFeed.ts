import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type CallHistoryItemDTO } from '../lib/api';
import {
  getCallsPrefetchCache,
  upsertCallsPrefetchCache,
} from '../lib/callsPrefetch';
import { friendshipsToCallFriends, type CallFriendRow } from '../lib/callFriends';
import { useRealtimeTopic } from './useRealtimeTopic';

export function useCallsFeed(myProfileId: string | null) {
  const cached = getCallsPrefetchCache();
  const [calls, setCalls] = useState<CallHistoryItemDTO[]>(() => cached?.calls ?? []);
  const [friends, setFriends] = useState<CallFriendRow[]>(() => cached?.friends ?? []);
  const [callsEnabled, setCallsEnabled] = useState<boolean | null>(
    () => cached?.callsEnabled ?? null
  );
  const [loading, setLoading] = useState(() => !(cached?.calls.length ?? 0));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
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
        setCalls(history);
        setFriends(nextFriends);
        setCallsEnabled(configRes.enabled);
        upsertCallsPrefetchCache({
          calls: history,
          friends: nextFriends,
          callsEnabled: configRes.enabled,
        });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to load call history';
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [myProfileId]
  );

  const silentRefresh = useCallback(async () => {
    try {
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
      setCalls(history);
      setFriends(nextFriends);
      setCallsEnabled(configRes.enabled);
      upsertCallsPrefetchCache({
        calls: history,
        friends: nextFriends,
        callsEnabled: configRes.enabled,
      });
    } catch {
      /* ignore background refresh errors */
    }
  }, [myProfileId]);

  useEffect(() => {
    const entry = getCallsPrefetchCache();
    if (entry && entry.calls.length > 0) {
      void silentRefresh();
      return;
    }
    void load();
  }, [load, silentRefresh]);

  useEffect(() => {
    if (!myProfileId || friends.length > 0) return;
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
  }, [myProfileId, friends.length]);

  useRealtimeTopic('calls', () => void silentRefresh());

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
