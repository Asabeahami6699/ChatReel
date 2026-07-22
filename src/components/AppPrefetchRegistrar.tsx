import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { scheduleCallsPrefetch } from '../lib/callsPrefetch';
import { scheduleGiftCatalogPrefetch } from '../lib/giftCatalogPrefetch';
import { scheduleReelInboxPrefetch } from '../lib/reelInboxPrefetch';
import { scheduleExplorePrefetch } from '../lib/momentsFeedPrefetch';
import { scheduleReelsFeedPrefetch } from '../lib/reelsFeedPrefetch';

/** Keep cold-start warm off the critical path so taps stay responsive. */
const APP_PREFETCH_DELAY_MS = 2200;

/** Warm Explore, Calls, and Reels feeds after login so tabs open faster — never at t=0. */
export function AppPrefetchRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    scheduleExplorePrefetch(APP_PREFETCH_DELAY_MS);
    scheduleCallsPrefetch(APP_PREFETCH_DELAY_MS + 800);
    scheduleReelsFeedPrefetch(APP_PREFETCH_DELAY_MS + 1600);
    scheduleGiftCatalogPrefetch(APP_PREFETCH_DELAY_MS + 2400);
    scheduleReelInboxPrefetch(APP_PREFETCH_DELAY_MS + 3000);
  }, [user]);

  return null;
}
