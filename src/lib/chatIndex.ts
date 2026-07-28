import { getMessageDisplayText } from './messageCrypto';
import { messageStorage, type ChatIndexRow } from '../utils/messageStorage';
import { notifyLocalStore, subscribeLocalStore } from './localMessageBus';
import { getActiveChatFocus } from './activeChatFocus';

function previewFromMessage(msg: Record<string, unknown> | null | undefined): string {
  if (!msg) return '';
  const type = typeof msg.message_type === 'string' ? msg.message_type : 'text';
  if (type === 'text' || !type) {
    return getMessageDisplayText(msg as Parameters<typeof getMessageDisplayText>[0]).slice(0, 160);
  }
  if (type === 'image') return 'Photo';
  if (type === 'video') return 'Video';
  if (type === 'audio') return 'Voice message';
  if (type === 'file') return 'File';
  if (type === 'reel') return 'Reel';
  if (type === 'moment') return 'Moment';
  return type;
}

export function inferChatTypeFromMessages(
  messages: Array<Record<string, unknown>>
): 'individual' | 'group' {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.group_id) return 'group';
  }
  return 'individual';
}

/** Upsert chat_index from a full local thread and notify subscribers. */
export async function bumpChatIndexFromMessages(
  chatId: string,
  messages: Array<Record<string, unknown>>,
  opts?: {
    chatType?: 'individual' | 'group';
    myUserId?: string;
    /** Absolute unread override; if omitted, keep existing or compute delta for new last msg. */
    unreadCount?: number;
    bumpUnreadIfIncoming?: boolean;
  }
): Promise<ChatIndexRow | null> {
  if (!chatId || messages.length === 0) return null;
  const chatType = opts?.chatType ?? inferChatTypeFromMessages(messages);
  const last = messages[messages.length - 1] as Record<string, unknown>;
  const lastAt =
    typeof last.created_at === 'string' ? last.created_at : new Date().toISOString();
  const lastId = typeof last.id === 'string' ? last.id : null;
  const lastType = typeof last.message_type === 'string' ? last.message_type : 'text';

  const existing = await messageStorage.getChatIndexRow(chatId);
  let unread = opts?.unreadCount ?? existing?.unreadCount ?? 0;

  if (opts?.bumpUnreadIfIncoming && opts.myUserId) {
    const focus = getActiveChatFocus();
    const open =
      focus?.chatId === chatId &&
      (focus.chatType === chatType || !focus.chatType);
    const fromOther = last.sender_id && last.sender_id !== opts.myUserId;
    if (!open && fromOther && lastId && lastId !== existing?.lastMessageId) {
      unread = (existing?.unreadCount ?? 0) + 1;
    }
  }

  const row: ChatIndexRow = {
    chatId,
    chatType,
    lastMessagePreview: previewFromMessage(last),
    lastMessageAt: lastAt,
    lastMessageId: lastId,
    lastMessageType: lastType,
    unreadCount: Math.max(0, unread),
    updatedAt: Date.now(),
  };

  await messageStorage.upsertChatIndex(row);
  notifyLocalStore({ reason: 'index', chatId, chatType });
  return row;
}

export async function resetChatIndexUnread(chatId: string): Promise<void> {
  const existing = await messageStorage.getChatIndexRow(chatId);
  if (!existing) return;
  await messageStorage.upsertChatIndex({ ...existing, unreadCount: 0, updatedAt: Date.now() });
  notifyLocalStore({ reason: 'index', chatId, chatType: existing.chatType });
}

/** Re-project chat_index whenever a thread is written to local storage. */
let projectorUserId: string | null = null;
const projectTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function projectChatIndex(
  chatId: string,
  chatType?: 'individual' | 'group'
): Promise<void> {
  const userId = projectorUserId;
  if (!userId || !chatId) return;
  try {
    const messages = (await messageStorage.getMessages(chatId)) as Array<
      Record<string, unknown>
    >;
    if (messages.length === 0) return;
    await bumpChatIndexFromMessages(chatId, messages, {
      chatType,
      myUserId: userId,
      bumpUnreadIfIncoming: true,
    });
  } catch {
    /* projection must never break writers */
  }
}

export function startChatIndexProjector(userId: string): () => void {
  projectorUserId = userId;
  const unsub = subscribeLocalStore((event) => {
    if (event.reason !== 'messages' || !event.chatId) return;
    const chatId = event.chatId;
    const prev = projectTimers.get(chatId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      projectTimers.delete(chatId);
      void projectChatIndex(chatId, event.chatType);
    }, 120);
    projectTimers.set(chatId, t);
  });
  return () => {
    unsub();
    if (projectorUserId === userId) projectorUserId = null;
    for (const t of projectTimers.values()) clearTimeout(t);
    projectTimers.clear();
  };
}

export function stopChatIndexProjector(): void {
  projectorUserId = null;
  for (const t of projectTimers.values()) clearTimeout(t);
  projectTimers.clear();
}
