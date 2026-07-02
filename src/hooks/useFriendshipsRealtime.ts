import { useRealtimeTopic } from './useRealtimeTopic';

/** Refetch when friendships change (accept, reject, new request, etc.). */
export function useFriendshipsRealtime(
  profileId: string | null | undefined,
  onChange: () => void
) {
  useRealtimeTopic(profileId ? 'friendships' : null, onChange);
}
