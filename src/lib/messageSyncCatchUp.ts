/**
 * Primary cursor catch-up: pull messages since the device sync cursor into the
 * local store (decrypt + persist). Complements realtime/WS for gaps after
 * background, reconnect, or missed deliveries.
 */
import { api } from './api';
import { getActiveChatFocus } from './activeChatFocus';
import { getOrCreateDeviceId } from './chatSocket';
import { rememberChatThread } from './chatThreadCache';
import { decryptChatMessages, rememberDecryptedText } from './messageCrypto';
import { notifyLocalStore } from './localMessageBus';
import {
  deduplicateMessages,
  sanitizeChatMessages,
  type ChatMessage,
} from '../screens/Chat/chatRoomTypes';
import { messageStorage } from '../utils/messageStorage';

const MAX_PAGES = 8;
const PAGE_LIMIT = 50;
const MAX_STORED_PER_CHAT = 300;
/** First-run window when neither local nor server cursor exists. */
const BOOTSTRAP_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

type ChatType = 'individual' | 'group';

let inFlight: Promise<void> | null = null;

function resolveChat(
  row: Record<string, unknown>,
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

async function persistBatch(
  chatId: string,
  chatType: ChatType,
  rows: ChatMessage[],
  userId: string
): Promise<void> {
  if (isOpen(chatId, chatType)) return;

  const storedRaw = (await messageStorage.getMessages(chatId)) as ChatMessage[];
  const merged = deduplicateMessages(
    sanitizeChatMessages([...storedRaw, ...rows])
  ).sort(byCreatedAt);
  const capped =
    merged.length > MAX_STORED_PER_CHAT ? merged.slice(-MAX_STORED_PER_CHAT) : merged;

  const decrypted = await decryptChatMessages(capped, userId);
  for (const m of decrypted) {
    if (m.decrypted) rememberDecryptedText(m.id, m.decrypted);
  }

  if (isOpen(chatId, chatType)) return;
  await messageStorage.saveMessages(chatId, decrypted, { chatType });
  rememberChatThread(chatId, decrypted);
}

async function resolveSince(deviceId: string): Promise<string> {
  const local = await messageStorage.getGlobalSyncCursor();
  if (local) return local;

  try {
    const { cursor } = await api.realtime.getSyncCursor(deviceId);
    const at = cursor?.cursor_at;
    if (typeof at === 'string' && at) return at;
  } catch {
    /* first device / no server cursor yet */
  }

  return new Date(Date.now() - BOOTSTRAP_LOOKBACK_MS).toISOString();
}

async function runCatchUp(userId: string): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  let since = await resolveSince(deviceId);
  let newest = since;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { messages } = await api.realtime.syncMessages(since, PAGE_LIMIT);
    if (!messages?.length) break;

    const byChat = new Map<
      string,
      { chatId: string; chatType: ChatType; rows: ChatMessage[] }
    >();

    for (const raw of messages) {
      const created =
        typeof raw.created_at === 'string' ? raw.created_at : null;
      if (created && created > newest) newest = created;

      const chat = resolveChat(raw, userId);
      if (!chat) continue;
      const key = `${chat.chatType}:${chat.chatId}`;
      const entry = byChat.get(key) ?? { ...chat, rows: [] };
      entry.rows.push(raw as ChatMessage);
      byChat.set(key, entry);
    }

    await Promise.all(
      [...byChat.values()].map((entry) =>
        persistBatch(entry.chatId, entry.chatType, entry.rows, userId).catch(() => undefined)
      )
    );

    const lastCreated = messages[messages.length - 1]?.created_at;
    if (typeof lastCreated === 'string' && lastCreated) {
      since = lastCreated;
    }

    if (messages.length < PAGE_LIMIT) break;
  }

  if (newest && newest !== (await messageStorage.getGlobalSyncCursor())) {
    await messageStorage.setGlobalSyncCursor(newest);
    try {
      await api.realtime.ackSync({
        device_id: deviceId,
        stream: 'messages',
        cursor_at: newest,
      });
    } catch {
      /* local cursor still advanced */
    }
  }

  notifyLocalStore({ reason: 'sync' });
}

/** Coalesced catch-up — safe to call from foreground, reconnect, and push. */
export function runMessageSyncCatchUp(userId: string): Promise<void> {
  if (!userId) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = runCatchUp(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
