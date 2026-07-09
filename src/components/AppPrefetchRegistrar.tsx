import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { scheduleCallsPrefetch } from '../lib/callsPrefetch';
import { scheduleExplorePrefetch } from '../lib/momentsFeedPrefetch';
import { scheduleReelsFeedPrefetch } from '../lib/reelsFeedPrefetch';

const APP_PREFETCH_DELAY_MS = 0;

/** Warm Explore, Calls, and Reels feeds shortly after login so tabs open instantly. */
export function AppPrefetchRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    scheduleExplorePrefetch(APP_PREFETCH_DELAY_MS);
    scheduleCallsPrefetch(APP_PREFETCH_DELAY_MS + 150);
    scheduleReelsFeedPrefetch(APP_PREFETCH_DELAY_MS + 300);
  }, [user]);

  return null;
}
