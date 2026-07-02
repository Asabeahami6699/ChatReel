import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './useAuth';
import { useCurrentProfileId } from './useCurrentProfileId';
import { useFriendshipsRealtime } from './useFriendshipsRealtime';

export function useIncomingFriendRequestCount(): number {
  const { user } = useAuth();
  const profileId = useCurrentProfileId();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    try {
      const { incoming } = await api.friendships.requests();
      setCount(incoming?.length ?? 0);
    } catch {
      /* keep previous count */
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFriendshipsRealtime(profileId, refresh);

  return count;
}
