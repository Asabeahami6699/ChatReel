import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeTopic } from '../hooks/useRealtimeTopic';
import { refreshReelInbox, scheduleReelInboxPrefetch } from '../lib/reelInboxPrefetch';

/** Keep reel inbox cache (and tab badge) fresh when likes/comments/gifts arrive. */
export function ReelInboxRealtimeRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    void scheduleReelInboxPrefetch(3200);
  }, [user]);

  useRealtimeTopic('reelLikes', () => {
    if (!user) return;
    void refreshReelInbox();
  });
  useRealtimeTopic('reelComments', () => {
    if (!user) return;
    void refreshReelInbox();
  });
  useRealtimeTopic('reelGifts', () => {
    if (!user) return;
    void refreshReelInbox();
  });

  return null;
}
