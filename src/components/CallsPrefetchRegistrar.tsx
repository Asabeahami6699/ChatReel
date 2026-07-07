import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { scheduleCallsPrefetch } from '../lib/callsPrefetch';
import { scheduleMomentsFeedPrefetch } from '../lib/momentsFeedPrefetch';

/** Warms Calls tab data + LiveKit and Moments feed in the background after login. */
export function CallsPrefetchRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    scheduleCallsPrefetch(2200);
    scheduleMomentsFeedPrefetch(2400);
  }, [user]);

  return null;
}
