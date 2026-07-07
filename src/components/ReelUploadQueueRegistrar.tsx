import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { initReelUploadQueue } from '../lib/reelUploadQueue';

/** Restores in-progress reel uploads after refresh / app restart. */
export function ReelUploadQueueRegistrar() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    void initReelUploadQueue();
  }, [loading, user]);

  return null;
}
