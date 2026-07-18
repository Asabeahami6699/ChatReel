import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  attachChatSocketAppState,
  connectChatSocket,
  disconnectChatSocket,
  onChatSocketEvent,
} from '../lib/chatSocket';
import { notifyRealtimeTopic } from '../lib/realtimeHub';
import { dispatchMessageRow, type ChatRealtimeRow } from '../lib/chatRealtime';

/**
 * Phase 3: own chat WebSocket alongside Supabase Realtime.
 * message.created feeds the row into the shared message dispatcher (which
 * dedupes against Supabase Realtime) and nudges topics so lists reconcile.
 */
export function ChatSocketRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) {
      disconnectChatSocket();
      return;
    }

    void connectChatSocket();
    const offApp = attachChatSocketAppState();
    const offEvt = onChatSocketEvent((ev) => {
      if (ev.type === 'message.created') {
        const row = ev.message as ChatRealtimeRow | undefined;
        if (row && typeof row === 'object' && typeof row.id === 'string') {
          dispatchMessageRow(row, 'INSERT');
        }
        // Keep the topic wake: HTTP reconciliation covers payload-less events.
        notifyRealtimeTopic('messages');
      }
    });

    return () => {
      offApp();
      offEvt();
      disconnectChatSocket();
    };
  }, [user?.id]);

  return null;
}
