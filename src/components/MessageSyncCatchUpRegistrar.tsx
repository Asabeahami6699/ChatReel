import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../hooks/useAuth';
import {
  startChatIndexProjector,
  stopChatIndexProjector,
} from '../lib/chatIndex';
import { onChatSocketEvent } from '../lib/chatSocket';
import { runMessageSyncCatchUp } from '../lib/messageSyncCatchUp';

/**
 * Local-first sync loop: project chat_index from message writes, and catch up
 * via the realtime sync cursor on foreground / reconnect / socket resume.
 */
export function MessageSyncCatchUpRegistrar() {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const running = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      stopChatIndexProjector();
      return;
    }

    const stopProjector = startChatIndexProjector(userId);

    const catchUp = () => {
      if (running.current) return;
      running.current = true;
      void runMessageSyncCatchUp(userId).finally(() => {
        running.current = false;
      });
    };

    catchUp();

    const appSub = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') catchUp();
      }
    );

    const netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        catchUp();
      }
    });

    const offSocket = onChatSocketEvent((ev) => {
      if (ev.type === 'ready' || ev.type === 'hello' || ev.type === 'auth.ok') {
        catchUp();
      }
    });

    return () => {
      stopProjector();
      stopChatIndexProjector();
      appSub.remove();
      netUnsub();
      offSocket();
    };
  }, [userId, loading]);

  return null;
}
