import type { ClusterPosition } from './chatTheme';

export type ChatListMessage = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  receiver_id?: string;
  group_id?: string;
  message_type?: 'text' | 'audio' | 'image' | 'video' | 'file' | 'reel' | 'moment';
  reel_id?: string;
  moment_id?: string;
  audio_url?: string;
  audio_duration?: number;
  file_url?: string;
  local_file_uri?: string;
  local_thumb_uri?: string;
  video_url?: string;
  file_name?: string;
  file_type?: string;
  is_read?: boolean;
  delivered?: boolean;
  reply_to_id?: string;
  edited_at?: string;
  reactions?: { emoji: string; user_id: string }[];
  read_count?: number;
  member_count?: number;
  profiles?: {
    display_name: string;
    avatar_url: string | null;
    user_id?: string;
  };
  _status?: 'sending' | 'sent' | 'pending' | 'failed';
  local_audio_uri?: string;
  expires_at?: string | null;
  view_once?: boolean;
  viewed_at?: string | null;
};

export type ChatRow =
  | { kind: 'date'; key: string; label: string }
  | { kind: 'unread'; key: string; count: number }
  | {
      kind: 'message';
      key: string;
      message: ChatListMessage;
      showAvatar: boolean;
      showName: boolean;
      clusterPosition: ClusterPosition;
    }
  | {
      kind: 'media_album';
      key: string;
      messages: ChatListMessage[];
      showAvatar: boolean;
      showName: boolean;
      clusterPosition: ClusterPosition;
    };

const CLUSTER_GAP_MS = 2 * 60 * 1000;
/** Group images/videos sent close together (same sender) into one album bubble. */
const MEDIA_ALBUM_GAP_MS = 45 * 1000;

function isAlbumMedia(msg: ChatListMessage): boolean {
  return msg.message_type === 'image' || msg.message_type === 'video';
}

function canAlbumTogether(a: ChatListMessage, b: ChatListMessage): boolean {
  if (!isAlbumMedia(a) || !isAlbumMedia(b)) return false;
  if (a.sender_id !== b.sender_id) return false;
  const dt = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return dt <= MEDIA_ALBUM_GAP_MS;
}

export function formatChatDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function sameCluster(a: ChatListMessage, b?: ChatListMessage): boolean {
  if (!b) return false;
  if (a.sender_id !== b.sender_id) return false;
  const dt = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return dt < CLUSTER_GAP_MS;
}

/** Rows in chronological order (oldest → newest) for an inverted FlatList. */
export function buildChatRows(
  messages: ChatListMessage[],
  opts: { isGroup: boolean; myUserId: string; firstUnreadId?: string | null }
): ChatRow[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const rows: ChatRow[] = [];
  let lastDateKey = '';
  let unreadInserted = false;

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i];

    if (!unreadInserted && opts.firstUnreadId && msg.id === opts.firstUnreadId) {
      const unreadCount = sorted.filter(
        (m) =>
          m.sender_id !== opts.myUserId &&
          !m.is_read &&
          new Date(m.created_at).getTime() >= new Date(msg.created_at).getTime()
      ).length;
      rows.push({ kind: 'unread', key: 'unread-divider', count: unreadCount || 1 });
      unreadInserted = true;
    }

    const d = new Date(msg.created_at);
    const dateKey = d.toDateString();

    if (dateKey !== lastDateKey) {
      rows.push({ kind: 'date', key: `date-${dateKey}`, label: formatChatDate(d) });
      lastDateKey = dateKey;
    }

    if (isAlbumMedia(msg)) {
      const album: ChatListMessage[] = [msg];
      let j = i + 1;
      while (j < sorted.length && canAlbumTogether(album[album.length - 1], sorted[j])) {
        album.push(sorted[j]);
        j++;
      }

      if (album.length > 1) {
        const prev = sorted[i - 1];
        const next = sorted[j];
        const albumAnchor = album[0];
        const albumTail = album[album.length - 1];
        const isFirst = !sameCluster(albumAnchor, prev);
        const isLast = !sameCluster(albumTail, next);

        let clusterPosition: ClusterPosition = 'middle';
        if (isFirst && isLast) clusterPosition = 'single';
        else if (isFirst) clusterPosition = 'first';
        else if (isLast) clusterPosition = 'last';

        const isIncoming = albumAnchor.sender_id !== opts.myUserId;

        rows.push({
          kind: 'media_album',
          key: `album-${album.map((m) => m.id).join('-')}`,
          messages: album,
          showAvatar: opts.isGroup && isIncoming && isLast,
          showName: opts.isGroup && isIncoming && isFirst,
          clusterPosition,
        });

        i = j - 1;
        continue;
      }
    }

    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const isFirst = !sameCluster(msg, prev);
    const isLast = !sameCluster(msg, next);

    let clusterPosition: ClusterPosition = 'middle';
    if (isFirst && isLast) clusterPosition = 'single';
    else if (isFirst) clusterPosition = 'first';
    else if (isLast) clusterPosition = 'last';

    const isIncoming = msg.sender_id !== opts.myUserId;

    rows.push({
      kind: 'message',
      key: msg.id,
      message: msg,
      showAvatar: opts.isGroup && isIncoming && isLast,
      showName: opts.isGroup && isIncoming && isFirst,
      clusterPosition,
    });
  }

  return rows;
}
