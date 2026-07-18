import { Platform } from 'react-native';
import { api } from './api';
import { uploadFromUri } from './uploads';
import {
  messageStorage,
  type MessageOutboxItem,
} from '../utils/messageStorage';
import { tryEncryptChatText } from './messageCrypto';

export type FlushedOutboxMessage = {
  chatId: string;
  client_message_id: string;
  message: Record<string, unknown>;
  local_file_uri?: string;
  local_audio_uri?: string;
};

/**
 * Upload (if needed) + send one outbox item. Removes from outbox on success.
 * Returns null if the item should stay queued (transient failure).
 */
export async function flushOutboxItem(
  item: MessageOutboxItem,
  senderUserId?: string
): Promise<FlushedOutboxMessage | null> {
  try {
    let payload = { ...item.payload };

    if (item.upload) {
      const { kind, localUri, mime, fileName, audioDuration, expires_at, view_once } =
        item.upload;
      const stamp = Date.now();
      const ext =
        kind === 'audio'
          ? Platform.OS === 'web'
            ? 'webm'
            : 'm4a'
          : fileName.includes('.')
            ? fileName.split('.').pop()
            : 'bin';
      const storagePath =
        kind === 'audio'
          ? `chat/audio/${stamp}_voice.${ext}`
          : `chat/files/${stamp}_${fileName}`;

      const publicUrl = await uploadFromUri('chat-files', storagePath, localUri, mime);

      if (kind === 'audio') {
        payload = {
          content: 'Voice message',
          message_type: 'audio',
          audio_url: publicUrl,
          audio_duration: audioDuration ?? 0,
          file_name: fileName,
          file_type: mime,
          client_message_id: item.client_message_id,
        };
      } else {
        payload = {
          content: fileName,
          message_type: kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'file',
          file_url: publicUrl,
          file_name: fileName,
          file_type: mime,
          client_message_id: item.client_message_id,
          ...(expires_at ? { expires_at } : {}),
          ...(view_once ? { view_once: true } : {}),
        };
      }

      if (item.chatType === 'individual') {
        payload.receiver_id = item.chatId;
      } else {
        payload.group_id = item.chatId;
      }
    }

    // Encrypt queued text if stored as plaintext (offline / missing keys).
    const msgType = String(payload.message_type || 'text');
    if (
      msgType === 'text' &&
      payload.plaintext !== false &&
      typeof payload.content === 'string'
    ) {
      const senderId =
        (typeof payload.sender_id === 'string' && payload.sender_id) ||
        senderUserId;
      const enc = await tryEncryptChatText({
        chatType: item.chatType,
        senderUserId: senderId,
        chatId: item.chatId,
        cleartext: payload.content,
      });
      if (enc) payload = { ...payload, ...enc };
    }

    const cleartextForCache =
      typeof item.payload.content === 'string' && item.payload.plaintext !== false
        ? String(item.payload.content)
        : typeof payload.content === 'string' && payload.plaintext !== false
          ? String(payload.content)
          : undefined;

    const { message } = await api.messages.send(payload);
    await messageStorage.removeOutbox(item.client_message_id);

    // Refresh local thread cache so reopen shows sent state.
    try {
      const local = (await messageStorage.getMessages(item.chatId)) as Array<
        Record<string, unknown>
      >;
      const next = local.map((m) =>
        m.client_message_id === item.client_message_id ||
        m.id === `temp-${item.client_message_id}`
          ? {
              ...message,
              client_message_id: item.client_message_id,
              profiles: m.profiles,
              _status: 'sent',
              decrypted:
                (typeof m.decrypted === 'string' && m.decrypted) ||
                cleartextForCache ||
                (typeof m.content === 'string' && !m.iv ? m.content : undefined),
              local_file_uri: m.local_file_uri ?? item.upload?.localUri,
              local_audio_uri:
                m.local_audio_uri ??
                (item.upload?.kind === 'audio' ? item.upload.localUri : undefined),
            }
          : m
      );
      await messageStorage.saveMessages(item.chatId, next);
    } catch {
      /* cache best-effort */
    }

    return {
      chatId: item.chatId,
      client_message_id: item.client_message_id,
      message: message as Record<string, unknown>,
      local_file_uri: item.upload?.kind !== 'audio' ? item.upload?.localUri : undefined,
      local_audio_uri: item.upload?.kind === 'audio' ? item.upload.localUri : undefined,
    };
  } catch (err) {
    console.warn('[outbox] flush failed', item.client_message_id, err);
    return null;
  }
}

/** Flush durable outbox for one chat or all chats. */
export async function flushMessageOutbox(
  chatId?: string,
  senderUserId?: string
): Promise<FlushedOutboxMessage[]> {
  const items = await messageStorage.getOutbox(chatId);
  const flushed: FlushedOutboxMessage[] = [];
  for (const item of items) {
    const result = await flushOutboxItem(item, senderUserId);
    if (result) flushed.push(result);
  }
  return flushed;
}
