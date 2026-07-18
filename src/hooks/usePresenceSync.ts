import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { setLocalActiveChatFocus } from '../lib/activeChatFocus';
import { api } from '../lib/api';
import { ensureSupabaseSession } from '../lib/ensureSupabaseSession';
import { useAuth } from './useAuth';

/** Keep peers' "Online / last seen" accurate without chat screens polling. */
const HEARTBEAT_MS = 60_000;

/** Keeps profiles.status / last_seen_at in sync while the app is open. */
export function usePresenceSync() {
  const { user } = useAuth();
  const appStateRef = useRef(AppState.currentState);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    let statusTimeout: ReturnType<typeof setTimeout> | undefined;

    const clearHeartbeat = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    const startHeartbeat = () => {
      clearHeartbeat();
      heartbeatRef.current = setInterval(() => {
        if (AppState.currentState !== 'active') return;
        void api.profiles.heartbeat().catch(() => undefined);
      }, HEARTBEAT_MS);
    };

    const pushStatus = async (isActive: boolean) => {
      if (statusTimeout) clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => {
        if (isActive) {
          void api.profiles
            .updateMe({ status: 'Online' })
            .then(() => startHeartbeat())
            .catch(() => undefined);
        } else {
          clearHeartbeat();
          setLocalActiveChatFocus(null);
          void api.profiles.setActiveChat(null).catch(() => undefined);
          void api.profiles.updateMe({ status: 'Offline' }).catch(() => undefined);
        }
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
      clearHeartbeat();
      if (statusTimeout) clearTimeout(statusTimeout);
      void (async () => {
        const session = await ensureSupabaseSession();
        if (!session?.access_token) return;
        await api.profiles.updateMe({ status: 'Offline' }).catch(() => undefined);
      })();
    };
  }, [user?.id]);
}
