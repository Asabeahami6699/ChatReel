import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { api } from '../lib/api';
import { ensureSupabaseSession } from '../lib/ensureSupabaseSession';
import { useAuth } from './useAuth';

/** Keeps profiles.status / last_seen_at in sync while the app is open. */
export function usePresenceSync() {
  const { user } = useAuth();
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!user?.id) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;

    const pushStatus = async (isActive: boolean) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        void api.profiles.updateMe({ status: isActive ? 'Online' : 'Offline' }).catch(() => undefined);
      }, 800);
    };

    const onChange = (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        void pushStatus(true);
      } else if (next.match(/inactive|background/)) {
        void pushStatus(false);
      }
      appStateRef.current = next;
    };

    void pushStatus(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', onChange);

    return () => {
      sub.remove();
      if (timeout) clearTimeout(timeout);
      void (async () => {
        const session = await ensureSupabaseSession();
        if (!session?.access_token) return;
        await api.profiles.updateMe({ status: 'Offline' }).catch(() => undefined);
      })();
    };
  }, [user?.id]);
}
