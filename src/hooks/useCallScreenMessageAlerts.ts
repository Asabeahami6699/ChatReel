import { useCallback, useEffect, useRef, useState } from 'react';
import { showAppToast } from '../lib/appToast';
import { getActiveChatFocus } from '../lib/activeChatFocus';
import { subscribeToMessageRows, type ChatRealtimeRow } from '../lib/chatRealtime';

function previewText(row: ChatRealtimeRow): string {
  const content = typeof row.content === 'string' ? row.content.trim() : '';
  if (content) return content.slice(0, 90);
  const t = typeof row.message_type === 'string' ? row.message_type : 'message';
  if (t === 'image') return '📷 Photo';
  if (t === 'video') return '🎬 Video';
  if (t === 'audio' || t === 'voice') return '🎤 Voice message';
  if (t === 'file') return '📎 File';
  return 'New message';
}

/**
 * While on an active call, toast incoming DMs/group messages when the user
 * is not inside that chat room, and track an unread count for the call UI badge.
 */
export function useCallScreenMessageAlerts(opts: {
  myAuthId: string | null;
  enabled: boolean;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const myAuthIdRef = useRef(opts.myAuthId);
  myAuthIdRef.current = opts.myAuthId;

  useEffect(() => {
    if (!opts.enabled || !opts.myAuthId) {
      setUnreadCount(0);
      return;
    }

    return subscribeToMessageRows((row, event) => {
      if (event !== 'INSERT') return;
      const me = myAuthIdRef.current;
      if (!me) return;
      if (row.sender_id === me) return;

      const isDirectToMe = row.receiver_id === me && !row.group_id;
      const isGroup = Boolean(row.group_id);
      if (!isDirectToMe && !isGroup) return;

      const focus = getActiveChatFocus();
      if (focus) {
        if (isGroup && focus.chatType === 'group' && focus.chatId === row.group_id) {
          return;
        }
        if (
          isDirectToMe &&
          focus.chatType === 'individual' &&
          focus.chatId === row.sender_id
        ) {
          return;
        }
      }

      const body = previewText(row);
      showAppToast(body);
      setUnreadCount((n) => Math.min(99, n + 1));
    });
  }, [opts.enabled, opts.myAuthId]);

  const clearUnread = useCallback(() => setUnreadCount(0), []);

  return { unreadCount, clearUnread };
}
