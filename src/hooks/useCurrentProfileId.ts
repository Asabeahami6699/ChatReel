import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './useAuth';

export function useCurrentProfileId(): string | null {
  const { user } = useAuth();
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setProfileId(null);
      return;
    }

    let cancelled = false;

    api.profiles
      .me()
      .then(({ profile }) => {
        if (!cancelled) {
          setProfileId((profile?.id as string) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setProfileId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return profileId;
}
