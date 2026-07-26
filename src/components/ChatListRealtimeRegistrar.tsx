import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import {
  ensureChatListRealtimeBridge,
  stopChatListRealtimeBridge,
} from '../lib/chatListRealtimeBridge';
import {
  flushIncomingMessagePersistence,
  startIncomingMessagePersistence,
  stopIncomingMessagePersistence,
} from '../lib/incomingMessagePersist';

/** Keeps chat-list message realtime alive even when ChatListScreen is unmounted. */
export function ChatListRealtimeRegistrar() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user?.id) {
      stopChatListRealtimeBridge();
      stopIncomingMessagePersistence();
      return;
    }

    ensureChatListRealtimeBridge(user.id);
    startIncomingMessagePersistence(user.id);

    // Backgrounding can suspend timers, so write anything still queued.
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushIncomingMessagePersistence();
    });

    return () => {
      sub.remove();
      stopChatListRealtimeBridge();
      // Discard rather than flush: sign-out wipes local storage right before
      // this runs, and a late write would resurrect the old account's messages.
      stopIncomingMessagePersistence();
    };
  }, [user?.id, loading]);

  return null;
}
