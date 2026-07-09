import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  ensureChatListRealtimeBridge,
  stopChatListRealtimeBridge,
} from '../lib/chatListRealtimeBridge';

/** Keeps chat-list message realtime alive even when ChatListScreen is unmounted. */
export function ChatListRealtimeRegistrar() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user?.id) {
      stopChatListRealtimeBridge();
      return;
    }

    ensureChatListRealtimeBridge(user.id);
    return () => stopChatListRealtimeBridge();
  }, [user?.id, loading]);

  return null;
}
