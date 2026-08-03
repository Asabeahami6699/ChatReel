import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { heartbeatCurrentDevice, registerCurrentDevice } from '../lib/deviceSession';
import { clearUserLocalCaches } from '../lib/clearUserLocalCaches';
import { showAppToast } from '../lib/appToast';

/**
 * Keeps the current install registered and signs out if it was revoked remotely.
 */
export function DeviceSessionRegistrar() {
  const { isAuthenticated, user, signOut } = useAuth();
  const busyRef = useRef(false);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    const run = async () => {
      if (busyRef.current) return;
      const now = Date.now();
      // Don't compete with message sends — skip if we just ran.
      if (now - lastRunAtRef.current < 45_000) return;
      busyRef.current = true;
      lastRunAtRef.current = now;
      try {
        // Fire-and-forget register; only await heartbeat for revoke check.
        void registerCurrentDevice();
        const hb = await heartbeatCurrentDevice();
        if (hb.revoked) {
          showAppToast(hb.message || 'Signed out on this device', { isError: true });
          await clearUserLocalCaches(user?.id ?? null);
          await signOut();
        }
      } finally {
        busyRef.current = false;
      }
    };

    // Delay first tick so login / send path aren't blocked by sessions API.
    const boot = setTimeout(() => void run(), 8_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    const interval = setInterval(() => void run(), 90_000);
    return () => {
      clearTimeout(boot);
      sub.remove();
      clearInterval(interval);
    };
  }, [isAuthenticated, signOut, user?.id]);

  return null;
}
