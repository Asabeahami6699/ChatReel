import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { scheduleExplorePrefetch } from '../lib/momentsFeedPrefetch';

/** Warms Explore (moments feed, previews, profile) in the background after login. */
export function ExplorePrefetchRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    scheduleExplorePrefetch(600);
  }, [user]);

  return null;
}
