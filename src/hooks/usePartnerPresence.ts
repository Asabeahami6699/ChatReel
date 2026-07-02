import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatLastSeen } from '../screens/Chat/chatMessageUtils';

type PartnerProfile = {
  status?: string;
  last_seen_at?: string | null;
  display_name?: string;
};

function profileEqual(a: PartnerProfile | null, b: PartnerProfile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    a.last_seen_at === b.last_seen_at &&
    a.display_name === b.display_name
  );
}

export function usePartnerPresence(partnerUserId: string | undefined, enabled: boolean) {
  const [profile, setProfile] = useState<PartnerProfile | null>(null);

  useEffect(() => {
    if (!partnerUserId || !enabled) {
      setProfile((prev) => (prev === null ? prev : null));
      return;
    }

    let alive = true;

    const load = async () => {
      try {
        const { profile: p } = await api.profiles.getByUserId(partnerUserId);
        if (!alive) return;
        const next = p as PartnerProfile;
        setProfile((prev) => (profileEqual(prev, next) ? prev : next));
      } catch {
        if (alive) setProfile((prev) => (prev === null ? prev : null));
      }
    };

    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [partnerUserId, enabled]);

  const statusText = formatLastSeen(profile?.last_seen_at, profile?.status);

  return { profile, statusText };
}
