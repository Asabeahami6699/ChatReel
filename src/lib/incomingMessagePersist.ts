/**
 * Persist realtime messages for chats that are not currently open.
 *
 * The open room already writes its own history to disk. Everything else lived
 * in memory only, so a restart lost messages the device had already been told
 * about. This mirrors the WhatsApp model: once a message arrives, it is kept
 * locally regardless of what is on screen.
 *
 * Writes are batched per chat and capped so storage growth stays bounded, and
 * the message is already in hand — there is no extra network cost.
 */

import { getActiveChatFocus } from './activeChatFocus';
import { subscribeToMessageRows, type ChatRealtimeRow } from './chatRealtime';
import { rememberChatThread } from './chatThreadCache';
import { decryptChatMessages, rememberDecryptedText } from './messageCrypto';
import {
  deduplicateMessages,
  sanitizeChatMessages,
  type ChatMessage,
} from '../screens/Chat/chatRoomTypes';
import { messageStorage } from '../utils/messageStorage';

/** Coalesce bursts (group traffic, reconnect catch-up) into one write per chat. */
const FLUSH_DEBOUNCE_MS = 700;
/** Keep local history bounded — rooms page older messages from the server. */
const MAX_STORED_PER_CHAT = 300;

type ChatType = 'individual' | 'group';
type PendingChat = { chatId: string; chatType: ChatType; rows: ChatMessage[] };

let unsubscribe: (() => void) | null = null;
let activeUserId: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const pending = new Map<string, PendingChat>();

function chatKey(chatType: ChatType, chatId: string) {
  return `${chatType}:${chatId}`;
}

/** Which local thread does this row belong to? DM chat ids are the peer's id. */
function resolveChat(
  row: ChatRealtimeRow,
  myUserId: string
): { chatId: string; chatType: ChatType } | null {
  if (typeof row.group_id === 'string' && row.group_id) {
    return { chatId: row.group_id, chatType: 'group' };
  }
  const sender = typeof row.sender_id === 'string' ? row.sender_id : '';
  const receiver = typeof row.receiver_id === 'string' ? row.receiver_id : '';
  if (!sender || !receiver) return null;
  if (sender === myUserId) return { chatId: receiver, chatType: 'individual' };
  if (receiver === myUserId) return { chatId: sender, chatType: 'individual' };
  return null;
}

function isOpen(chatId: string, chatType: ChatType): boolean {
  const focus = getActiveChatFocus();
  return focus?.chatId === chatId && focus.chatType === chatType;
}

function byCreatedAt(a: ChatMessage, b: ChatMessage): number {
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
  if (typeof flushTimer === 'object' && flushTimer !== null && 'unref' in flushTimer) {
    (flushTimer as { unref?: () => void }).unref?.();
  }
}

async function persistChat(entry: PendingChat, userId: string): Promise<void> {
  // The room owns its own writes; skip to avoid clobbering optimistic state.
  if (isOpen(entry.chatId, entry.chatType)) return;

  const storedRaw = (await messageStorage.getMessages(entry.chatId)) as ChatMessage[];
  const merged = deduplicateMessages(
    sanitizeChatMessages([...storedRaw, ...entry.rows])
  ).sort(byCreatedAt);

  const capped =
    merged.length > MAX_STORED_PER_CHAT ? merged.slice(-MAX_STORED_PER_CHAT) : merged;

  const decrypted = await decryptChatMessages(capped, userId);
  for (const m of decrypted) {
    if (m.decrypted) rememberDecryptedText(m.id, m.decrypted);
  }

  if (isOpen(entry.chatId, entry.chatType)) return;
  await messageStorage.saveMessages(entry.chatId, decrypted);
  rememberChatThread(entry.chatId, decrypted);
}

async function flush(): Promise<void> {
  if (flushing) {
    scheduleFlush();
    return;
  }
  const userId = activeUserId;
  if (!userId || pending.size === 0) return;

  flushing = true;
  const batch = [...pending.values()];
  pending.clear();

  try {
    // Sequential: storage writes should never compete with UI work in a burst.
    for (const entry of batch) {
      if (activeUserId !== userId) return;
      try {
        await persistChat(entry, userId);
      } catch {
        /* one bad chat must not stop the rest */
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * Start mirroring realtime message rows to local storage for the signed-in user.
 * Safe to call repeatedly; re-registers only when the user changes.
 */
export function startIncomingMessagePersistence(authUserId: string): void {
  if (unsubscribe && activeUserId === authUserId) return;

  stopIncomingMessagePersistence();
  activeUserId = authUserId;

  unsubscribe = subscribeToMessageRows((row) => {
    const me = activeUserId;
    if (!me || !row?.id || typeof row.id !== 'string') return;

    const chat = resolveChat(row, me);
    if (!chat) return;
    if (isOpen(chat.chatId, chat.chatType)) return;

    const key = chatKey(chat.chatType, chat.chatId);
    const entry = pending.get(key) ?? { ...chat, rows: [] };
    // An UPDATE replaces the queued copy so edits/status changes win.
    entry.rows = entry.rows.filter((m) => m.id !== row.id);
    entry.rows.push(row as ChatMessage);
    pending.set(key, entry);
    scheduleFlush();
  });
}

export function stopIncomingMessagePersistence(): void {
  unsubscribe?.();
  unsubscribe = null;
  activeUserId = null;
  pending.clear();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** Write anything still queued — call before backgrounding or sign-out. */
export function flushIncomingMessagePersistence(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flush();
}
