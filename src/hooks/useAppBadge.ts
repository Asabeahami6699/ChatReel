import { useEffect } from 'react';
import { setAppBadgeCount } from '../lib/appBadge';

/**
 * Syncs the app icon badge count with the total unread count.
 * Only runs on native platforms (iOS / Android).
 */
export function useAppBadge(totalUnread: number) {
  useEffect(() => {
    setAppBadgeCount(totalUnread);
  }, [totalUnread]);
}
