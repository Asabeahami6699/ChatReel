import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import {
  heartbeatCurrentDevice,
  registerCurrentDevice,
  sessionsApiReady,
} from '../lib/deviceSession';
import { clearUserLocalCaches } from '../lib/clearUserLocalCaches';
import { showAppToast } from '../lib/appToast';

/**
 * Keeps the current install registered and signs out if it was revoked remotely.
 * Skips entirely when the deployed API has no /account/sessions routes (404).
 */
export function DeviceSessionRegistrar() {
  const { isAuthenticated, user, signOut } = useAuth();
  const busyRef = useRef(false);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    const run = async () => {
      if (busyRef.current) return;
      if (!sessionsApiReady()) return;
      const now = Date.now();
      if (now - lastRunAtRef.current < 45_000) return;
      busyRef.current = true;
      lastRunAtRef.current = now;
      try {
        // Sequential: register first so a 404 trips the circuit before heartbeat.
        await registerCurrentDevice();
        if (!sessionsApiReady()) return;
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
