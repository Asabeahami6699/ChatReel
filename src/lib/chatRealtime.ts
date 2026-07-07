import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type ChatRealtimeRow = Record<string, unknown> & {
  id?: string;
  sender_id?: string;
  receiver_id?: string;
  group_id?: string;
};

export type ChatRealtimeHandlers = {
  onInsert: (row: ChatRealtimeRow) => void;
  onUpdate: (row: ChatRealtimeRow) => void;
};

type MessageRowListener = (row: ChatRealtimeRow, event: 'INSERT' | 'UPDATE') => void;
const messageRowListeners = new Set<MessageRowListener>();

/** Subscribe to message row events from the global realtime hub (one WS binding). */
export function subscribeToMessageRows(listener: MessageRowListener): () => void {
  messageRowListeners.add(listener);
  return () => messageRowListeners.delete(listener);
}

/** Called by realtimeHub when a messages row changes. */
export function dispatchMessageRow(row: ChatRealtimeRow, event: 'INSERT' | 'UPDATE') {
  messageRowListeners.forEach((listener) => {
    try {
      listener(row, event);
    } catch (e) {
      console.error('[chatRealtime] listener error:', e);
    }
  });
}

/**
 * Per-chat Supabase channel for live message INSERT/UPDATE in the open room.
 * Used alongside the global hub dispatch (subscribeToMessageRows).
 */
export function subscribeToChatMessages(
  chatId: string,
  chatType: 'individual' | 'group',
  authUserId: string,
  handlers: ChatRealtimeHandlers
): RealtimeChannel {
  const channel = supabase.channel(
    `chat-messages:${chatType}:${chatId}:${authUserId}`
  );

  // Flag flipped on by the consumer when it intentionally tears the channel down.
  // We patch a small `_closeIntentional` marker so the subscribe callback can
  // distinguish expected closes (navigation) from unexpected ones (auth/WS drop).
  (channel as unknown as { _closeIntentional?: boolean })._closeIntentional = false;
  const origUnsubscribe = channel.unsubscribe.bind(channel);
  channel.unsubscribe = ((...args: Parameters<typeof origUnsubscribe>) => {
    (channel as unknown as { _closeIntentional?: boolean })._closeIntentional = true;
    return origUnsubscribe(...args);
  }) as typeof channel.unsubscribe;

  const belongsToChat = (row: ChatRealtimeRow): boolean => {
    if (chatType === 'group') {
      return row.group_id === chatId;
    }
    return (
      (row.sender_id === authUserId && row.receiver_id === chatId) ||
      (row.sender_id === chatId && row.receiver_id === authUserId)
    );
  };

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'messages' },
    (payload) => {
      const row = (payload.new ?? payload.old) as ChatRealtimeRow | null;
      if (!row || !row.id) return;
      if (!belongsToChat(row)) return;

      if (payload.eventType === 'INSERT') {
        handlers.onInsert(row);
      } else if (payload.eventType === 'UPDATE') {
        handlers.onUpdate(row);
      }
    }
  );

  let errorRetries = 0;
  channel.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED') {
      errorRetries = 0;
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('[chatRealtime] channel status', status, err);
      // Re-apply the auth token in case it's a JWT expiry / refresh race, then let
      // supabase-js auto-reconnect. Cap retries to avoid log spam.
      if (errorRetries < 3) {
        errorRetries += 1;
        try {
          const { ensureSupabaseSession } = await import('./ensureSupabaseSession');
          await ensureSupabaseSession();
        } catch {
          /* ignore */
        }
      }
    } else if (status === 'CLOSED') {
      const intentional = (channel as unknown as { _closeIntentional?: boolean })
        ._closeIntentional;
      if (!intentional) {
        console.warn('[chatRealtime] channel closed unexpectedly', chatType, chatId);
      }
    }
  });

  return channel;
}
