import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { scheduleCallsPrefetch } from '../lib/callsPrefetch';

/** Warms Calls tab data + LiveKit in the background after login. */
export function CallsPrefetchRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    scheduleCallsPrefetch(2200);
  }, [user]);

  return null;
}
