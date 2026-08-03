import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { prefetch2faStatus } from '../lib/account2faCache';
import { scheduleCallsPrefetch } from '../lib/callsPrefetch';
import { scheduleFriendsPrefetch } from '../lib/friendsPrefetch';
import { scheduleGiftCatalogPrefetch } from '../lib/giftCatalogPrefetch';
import { scheduleReelInboxPrefetch } from '../lib/reelInboxPrefetch';
import { scheduleExplorePrefetch } from '../lib/momentsFeedPrefetch';
import { scheduleReelsFeedPrefetch } from '../lib/reelsFeedPrefetch';

/** Keep cold-start warm off the critical path so taps stay responsive. */
const APP_PREFETCH_DELAY_MS = 2200;

/** Warm Explore, Calls, Friends, and Reels feeds after login so tabs open faster — never at t=0. */
export function AppPrefetchRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    // 2FA status is tiny — prefetch early so Settings opens live.
    void prefetch2faStatus();
    scheduleExplorePrefetch(APP_PREFETCH_DELAY_MS);
    scheduleFriendsPrefetch(APP_PREFETCH_DELAY_MS + 400);
    scheduleCallsPrefetch(APP_PREFETCH_DELAY_MS + 800);
    scheduleReelsFeedPrefetch(APP_PREFETCH_DELAY_MS + 1600);
    scheduleGiftCatalogPrefetch(APP_PREFETCH_DELAY_MS + 2400);
    scheduleReelInboxPrefetch(APP_PREFETCH_DELAY_MS + 3000);
  }, [user]);

  return null;
}
