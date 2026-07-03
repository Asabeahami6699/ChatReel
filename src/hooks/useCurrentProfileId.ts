import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useProfileStore } from '../stores/profileStore';

export function useCurrentProfileId(): string | null {
  const { user } = useAuth();
  const profileId = useProfileStore((s) => s.profileId);
  const ensureLoaded = useProfileStore((s) => s.ensureLoaded);
  const reset = useProfileStore((s) => s.reset);

  useEffect(() => {
    if (!user?.id) {
      reset();
      return;
    }
    void ensureLoaded(user.id);
  }, [user?.id, ensureLoaded, reset]);

  return profileId;
}
