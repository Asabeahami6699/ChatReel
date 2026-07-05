import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { scheduleReelsFeedPrefetch } from '../lib/reelsFeedPrefetch';

/** Warms reels feed + first video in the background after login (idle delay). */
export function ReelsPrefetchRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    scheduleReelsFeedPrefetch(1800);
  }, [user]);

  return null;
}
