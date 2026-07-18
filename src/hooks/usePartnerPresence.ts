import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '../lib/api';
import { formatLastSeen } from '../screens/Chat/chatMessageUtils';
import { useRealtimeTopic } from './useRealtimeTopic';

type PartnerProfile = {
  status?: string;
  last_seen_at?: string | null;
  display_name?: string;
};

/** Rare safety net — presence is not critical path; Realtime profiles + focus are preferred. */
const FALLBACK_POLL_MS = 90_000;

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

  const load = useCallback(async () => {
    if (!partnerUserId || !enabled) {
      setProfile(null);
      return;
    }
    try {
      const { profile: p } = await api.profiles.getByUserId(partnerUserId);
      const next = p as PartnerProfile;
      setProfile((prev) => (profileEqual(prev, next) ? prev : next));
    } catch {
      setProfile((prev) => (prev === null ? prev : null));
    }
  }, [partnerUserId, enabled]);

  useEffect(() => {
    if (!partnerUserId || !enabled) {
      setProfile((prev) => (prev === null ? prev : null));
      return;
    }

    void load();
    const timer = setInterval(() => void load(), FALLBACK_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [partnerUserId, enabled, load]);

  // Own profile hub events often fire on presence heartbeats; cheap refresh when any profile topic wakes.
  useRealtimeTopic('profiles', () => void load(), Boolean(partnerUserId && enabled));

  const statusText = formatLastSeen(profile?.last_seen_at, profile?.status);

  return { profile, statusText };
}
