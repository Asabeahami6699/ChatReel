/**
 * Phase 1: Expo push is native-only.
 * Web uses Supabase Realtime + App badge while the tab is open;
 * there is no service-worker / web-push registration here.
 */
export function usePushNotifications(_userId: string | undefined): void {
  /* intentionally empty */
}

export async function syncPushRegistrationForSetting(
  _userId: string | undefined,
  _enabled: boolean
): Promise<void> {
  /* no-op on web */
}

