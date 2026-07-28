/**
 * On push receive: fetch recent messages for that chat, decrypt, and persist
 * into the local store so the UI already has them when the user opens the chat.
 */
import { api } from './api';
import { getActiveChatFocus } from './activeChatFocus';
import { rememberChatThread } from './chatThreadCache';
import { decryptChatMessages, rememberDecryptedText } from './messageCrypto';
import {
  deduplicateMessages,
  sanitizeChatMessages,
  type ChatMessage,
} from '../screens/Chat/chatRoomTypes';
import { messageStorage } from '../utils/messageStorage';
import { runMessageSyncCatchUp } from './messageSyncCatchUp';

const MAX_STORED_PER_CHAT = 300;
const FETCH_LIMIT = 40;

function isOpen(chatId: string, chatType: 'individual' | 'group'): boolean {
  const focus = getActiveChatFocus();
  return focus?.chatId === chatId && focus.chatType === chatType;
}

function byCreatedAt(a: ChatMessage, b: ChatMessage): number {
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
}

export async function hydrateChatFromPush(opts: {
  userId: string;
  chatId: string;
  chatType: 'individual' | 'group';
}): Promise<void> {
  const { userId, chatId, chatType } = opts;
  if (!userId || !chatId) return;
  if (isOpen(chatId, chatType)) return;

  try {
    const { messages: remote } = await api.messages.list(
      chatId,
      chatType === 'group',
      FETCH_LIMIT
    );
    if (!remote?.length) {
      // Still run cursor catch-up in case the list endpoint lags.
      void runMessageSyncCatchUp(userId);
      return;
    }

    if (isOpen(chatId, chatType)) return;

    const storedRaw = (await messageStorage.getMessages(chatId)) as ChatMessage[];
    const merged = deduplicateMessages(
      sanitizeChatMessages([...storedRaw, ...(remote as ChatMessage[])])
    ).sort(byCreatedAt);
    const capped =
      merged.length > MAX_STORED_PER_CHAT
        ? merged.slice(-MAX_STORED_PER_CHAT)
        : merged;

    const decrypted = await decryptChatMessages(capped, userId);
    for (const m of decrypted) {
      if (m.decrypted) rememberDecryptedText(m.id, m.decrypted);
    }

    if (isOpen(chatId, chatType)) return;
    await messageStorage.saveMessages(chatId, decrypted, { chatType });
    rememberChatThread(chatId, decrypted);

    // Advance global cursor when possible.
    const last = decrypted[decrypted.length - 1];
    const lastAt = typeof last?.created_at === 'string' ? last.created_at : null;
    if (lastAt) {
      const cursor = await messageStorage.getGlobalSyncCursor();
      if (!cursor || lastAt > cursor) {
        await messageStorage.setGlobalSyncCursor(lastAt);
      }
    }
  } catch (err) {
    console.warn('[pushHydrate] failed', err);
    void runMessageSyncCatchUp(userId);
  }
}
