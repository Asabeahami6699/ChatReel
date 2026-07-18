import { useEffect, useRef } from 'react';
import { subscribeToMessageRows } from '../../lib/chatRealtime';
import type { ChatMessage } from './chatRoomTypes';
import {
  isIncomingChatMessage,
  isOutgoingChatMessage,
  messageBelongsToChat,
} from './chatRoomTypes';

type Handler = (row: ChatMessage, event: 'INSERT' | 'UPDATE') => void;

type Options = {
  chatId: string;
  chatType: 'individual' | 'group';
  userId: string | undefined;
  onMessage: Handler;
};

function logRealtime(
  level: 'log' | 'warn' | 'error',
  message: string,
  details?: Record<string, unknown>
) {
  const fn = console[level];
  if (details) {
    fn(`[chatRoomRealtime] ${message}`, details);
  } else {
    fn(`[chatRoomRealtime] ${message}`);
  }
}

/**
 * Live message delivery for the open chat via the global hub dispatch
 * (subscribeToMessageRows). Rows arrive from the hub's single Supabase
 * `messages` binding and from the custom chat WebSocket; both funnel through
 * dispatchMessageRow, and INSERTs are deduped here by message id.
 */
export function useChatRoomRealtime({
  chatId,
  chatType,
  userId,
  onMessage,
}: Options) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!chatId || !userId) return;

    let cancelled = false;
    const deliveredIds = new Set<string>();

    logRealtime('log', 'listening', { chatType, chatId, userId });

    const belongs = (row: ChatMessage) =>
      messageBelongsToChat(row, chatId, chatType, userId);

    const deliver = (
      row: ChatMessage,
      event: 'INSERT' | 'UPDATE',
      source: 'hub'
    ) => {
      if (cancelled || !row?.id) return;

      if (!belongs(row)) {
        const touchesUser =
          row.sender_id === userId ||
          row.receiver_id === userId ||
          row.group_id === chatId;
        if (touchesUser) {
          logRealtime('warn', 'row skipped (belongsToChat mismatch)', {
            source,
            event,
            messageId: row.id,
            sender_id: row.sender_id,
            receiver_id: row.receiver_id,
            group_id: row.group_id,
            chatId,
            userId,
          });
        }
        return;
      }

      const direction = isOutgoingChatMessage(row, userId)
        ? 'outgoing-echo'
        : isIncomingChatMessage(row, chatId, chatType, userId)
          ? 'incoming'
          : 'unknown';

      if (event === 'INSERT' && deliveredIds.has(row.id)) {
        logRealtime('log', `duplicate INSERT ignored (${source})`, {
          messageId: row.id,
          direction,
        });
        return;
      }
      if (event === 'INSERT') deliveredIds.add(row.id);

      handlerRef.current(row, event);
    };

    const unsubscribeHub = subscribeToMessageRows((row, event) => {
      deliver(row as ChatMessage, event, 'hub');
    });

    return () => {
      cancelled = true;
      unsubscribeHub();
      logRealtime('log', 'stopped listening', { chatType, chatId });
    };
  }, [chatId, chatType, userId]);
}
