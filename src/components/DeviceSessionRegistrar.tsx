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

  useEffect(() => {
    if (!isAuthenticated) return;

    const run = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        await registerCurrentDevice();
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

    void run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    const interval = setInterval(() => void run(), 60_000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [isAuthenticated, signOut, user?.id]);

  return null;
}
