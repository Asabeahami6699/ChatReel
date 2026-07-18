export type ChatMessage = {
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
  /** Stable client id for idempotent retries (survives offline / double-tap). */
  client_message_id?: string;
  local_audio_uri?: string;
  /** Disappearing media: ISO timestamp after which the message is hidden. */
  expires_at?: string | null;
  /** View-once media: removed after the recipient opens it. */
  view_once?: boolean;
  viewed_at?: string | null;
  /** false = content is ciphertext (DM E2E). Missing/true = plaintext. */
  plaintext?: boolean;
  iv?: string;
  ephemeral_public_key?: string;
  /** Client-only cleartext after decrypt / sender cache. Never sent to API. */
  decrypted?: string;
};

export type ChatRouteParams = {
  chatId: string;
  chatType: 'individual' | 'group';
  chatName: string;
  avatarUrl?: string;
};

export type AttachmentFile = {
  id: string;
  uri: string;
  mimeType?: string;
  name?: string | null;
  size?: number;
  type: 'photo' | 'video' | 'audio' | 'document';
  thumbnail?: string;
  duration?: number;
  /** Disappearing media: seconds until the message expires (null/0 = visible to everyone). */
  expiresInSeconds?: number | null;
  /** View-once media: removed after the recipient opens it. */
  viewOnce?: boolean;
};

/** UUID-like client id used for idempotent inserts. */
export function generateClientMessageId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* fall through */
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Local optimistic row id (still recognized by temp-* merge paths). */
export function generateTempId(clientMessageId?: string) {
  const cid = clientMessageId ?? generateClientMessageId();
  return `temp-${cid}`;
}

/** Convert a "disappear after N seconds" choice into an absolute expiry timestamp. */
export function visibilityToExpiry(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/** A message is hidden once its expiry timestamp has passed. */
export function isMessageExpired(message: ChatMessage, now: number = Date.now()): boolean {
  if (!message.expires_at) return false;
  const ts = new Date(message.expires_at).getTime();
  return Number.isFinite(ts) && ts <= now;
}

export function isLocalFile(uri: string): boolean {
  return Boolean(
    uri &&
      (uri.startsWith('file://') ||
        uri.startsWith('content://') ||
        uri.startsWith('blob:') ||
        uri.startsWith('/') ||
        uri.includes('ExponentAudio'))
  );
}

/** Blob URLs die on page refresh — never treat them as durable cache. */
export function isEphemeralLocalUri(uri: string | undefined | null): boolean {
  return Boolean(uri?.startsWith('blob:'));
}

export function sanitizeChatMessage<T extends ChatMessage>(message: T): T {
  const next = { ...message };
  if (isEphemeralLocalUri(next.local_file_uri)) {
    delete next.local_file_uri;
  }
  if (isEphemeralLocalUri(next.local_audio_uri) && next.audio_url) {
    delete next.local_audio_uri;
  }
  return next;
}

export function sanitizeChatMessages<T extends ChatMessage>(messages: T[]): T[] {
  return messages.map(sanitizeChatMessage);
}

/** Resolve display URI for image/video/audio bubbles. */
export function getMediaUri(message: ChatMessage): string {
  const remoteFile = message.file_url?.split('?')[0];
  const remoteAudio = message.audio_url?.split('?')[0];
  if (remoteFile) return remoteFile;
  if (remoteAudio) return remoteAudio;

  if (
    message.local_file_uri &&
    message.local_file_uri !== 'null' &&
    message.local_file_uri !== 'undefined' &&
    isLocalFile(message.local_file_uri) &&
    !isEphemeralLocalUri(message.local_file_uri)
  ) {
    return message.local_file_uri;
  }
  return '';
}

/** Best URI for playing a voice message (remote URL preferred over dead blobs). */
export function getAudioPlaybackUri(message: ChatMessage): string {
  const remote = message.audio_url?.split('?')[0];
  if (remote && remote.startsWith('http')) return remote;

  const local = message.local_audio_uri;
  if (local && !isEphemeralLocalUri(local)) return local;

  if (remote && !isEphemeralLocalUri(remote)) return remote;
  return local || remote || '';
}

export function deduplicateMessages(messages: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  const byClientId = new Map<string, ChatMessage>();

  const prefer = (a: ChatMessage, b: ChatMessage): ChatMessage => {
    const aTemp = a.id.startsWith('temp-');
    const bTemp = b.id.startsWith('temp-');
    if (aTemp !== bTemp) return aTemp ? b : a;
    return a;
  };

  for (const message of messages) {
    if (!message?.id) continue;
    const prev = byId.get(message.id);
    byId.set(message.id, prev ? prefer(prev, message) : message);

    const cid = message.client_message_id;
    if (cid) {
      const prevCid = byClientId.get(cid);
      byClientId.set(cid, prevCid ? prefer(prevCid, message) : message);
    }
  }

  // Collapse temp + server rows that share client_message_id.
  const collapsed = new Map<string, ChatMessage>();
  for (const message of byId.values()) {
    const cid = message.client_message_id;
    if (cid && byClientId.has(cid)) {
      const winner = byClientId.get(cid)!;
      collapsed.set(winner.id, winner);
      continue;
    }
    collapsed.set(message.id, message);
  }

  return [...collapsed.values()].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return 1;
    if (!Number.isFinite(tb)) return -1;
    return ta - tb;
  });
}

export function messageBelongsToChat(
  msg: ChatMessage,
  chatId: string,
  chatType: 'individual' | 'group',
  userId: string | undefined
): boolean {
  if (!userId || !chatId) return false;
  if (chatType === 'group') {
    return msg.group_id === chatId;
  }
  return (
    (msg.sender_id === userId && msg.receiver_id === chatId) ||
    (msg.sender_id === chatId && msg.receiver_id === userId)
  );
}

/** True when the signed-in user sent this message. */
export function isOutgoingChatMessage(
  msg: Pick<ChatMessage, 'sender_id'>,
  userId: string | undefined
): boolean {
  return Boolean(userId && msg.sender_id === userId);
}

/** True when a partner (not the signed-in user) sent this message in the open chat. */
export function isIncomingChatMessage(
  msg: ChatMessage,
  chatId: string,
  chatType: 'individual' | 'group',
  userId: string | undefined
): boolean {
  return messageBelongsToChat(msg, chatId, chatType, userId) && !isOutgoingChatMessage(msg, userId);
}

/** Match an optimistic temp row to a server row from realtime / API. */
export function matchesOptimisticTemp(
  temp: ChatMessage,
  server: ChatMessage,
  userId: string | undefined
): boolean {
  if (!temp.id.startsWith('temp-') || temp.sender_id !== userId || server.sender_id !== userId) {
    return false;
  }
  if (
    temp.client_message_id &&
    server.client_message_id &&
    temp.client_message_id === server.client_message_id
  ) {
    return true;
  }
  if (temp.content && server.content && temp.content === server.content) return true;
  if (temp.file_name && server.file_name && temp.file_name === server.file_name) return true;
  if (temp.message_type === 'audio' && server.message_type === 'audio') return true;
  const dt = Math.abs(
    new Date(temp.created_at).getTime() - new Date(server.created_at).getTime()
  );
  return dt < 15000;
}

/** Tolerance so messages aren't hidden after "clear chat" due to client/server clock skew. */
export const CLEARED_AT_SKEW_MS = 60_000;

export function filterMessagesByClearedAt<T extends ChatMessage>(
  list: T[],
  clearedAt: string | null | undefined
): T[] {
  if (!clearedAt) return list;
  const cutoff = new Date(clearedAt).getTime() - CLEARED_AT_SKEW_MS;
  return list.filter((m) => {
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) return true;
    return t > cutoff;
  });
}

/** Fill missing fields on a Supabase realtime / API row before merging into UI state. */
export function normalizeRealtimeMessage(
  raw: ChatMessage,
  chatId: string,
  chatType: 'individual' | 'group',
  userId: string
): ChatMessage {
  const createdMs = raw.created_at ? new Date(raw.created_at).getTime() : NaN;
  const next: ChatMessage = {
    ...raw,
    content: raw.content ?? '',
    message_type: raw.message_type ?? 'text',
    created_at: Number.isFinite(createdMs) ? raw.created_at! : new Date().toISOString(),
  };

  if (chatType === 'group') {
    if (!next.group_id) next.group_id = chatId;
  } else if (!next.receiver_id) {
    if (next.sender_id === userId) next.receiver_id = chatId;
    else if (next.sender_id === chatId) next.receiver_id = userId;
  }

  return next;
}

export function countUnreadFromPartner(
  messages: ChatMessage[],
  chatId: string,
  userId: string | undefined
): number {
  if (!userId) return 0;
  return messages.filter(
    (m) => m.sender_id === chatId && m.receiver_id === userId && !m.is_read
  ).length;
}

export function buildChatSendPayload(
  chatType: 'individual' | 'group',
  chatId: string,
  fields: Record<string, unknown>,
  replyToId?: string | null
): Record<string, unknown> {
  return {
    ...fields,
    ...(replyToId ? { reply_to_id: replyToId } : {}),
    ...(chatType === 'individual' ? { receiver_id: chatId } : { group_id: chatId }),
  };
}
