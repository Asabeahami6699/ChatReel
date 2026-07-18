// src/utils/messageStorage.ts
//
// Web/AsyncStorage fallback. On iOS/Android, Metro platform resolution picks
// messageStorage.native.ts (expo-sqlite) instead; both export the same API.
// Note: this API has no authenticated-owner parameter, so storage is
// device-scoped and shared across accounts on the same device.
import AsyncStorage from '@react-native-async-storage/async-storage';

const MESSAGES_KEY = (chatId: string) => `messages_${chatId}`;
const LAST_SYNC_KEY = (chatId: string) => `last_sync_${chatId}`;
const DRAFT_KEY = (chatId: string) => `draft_${chatId}`;
const OUTBOX_KEY = 'message_send_outbox_v1';

export type MessageOutboxUpload = {
  kind: 'audio' | 'image' | 'video' | 'file';
  localUri: string;
  mime: string;
  fileName: string;
  audioDuration?: number;
  expires_at?: string | null;
  view_once?: boolean;
};

export type MessageOutboxItem = {
  client_message_id: string;
  chatId: string;
  chatType: 'individual' | 'group';
  /** Ready-to-POST body for text (or after upload). */
  payload: Record<string, unknown>;
  created_at: string;
  /** When set, flush uploads this local file before send. */
  upload?: MessageOutboxUpload;
};

async function readOutbox(): Promise<MessageOutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MessageOutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: MessageOutboxItem[]) {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export const messageStorage = {
  // Save messages to local storage
  saveMessages: async (chatId: string, messages: any[]) => {
    try {
      const sanitized = messages.map((m) => {
        const copy = { ...m };
        if (copy.local_file_uri?.startsWith?.('blob:')) {
          if (copy.file_url) delete copy.local_file_uri;
          else delete copy.local_file_uri;
        }
        if (copy.local_audio_uri?.startsWith?.('blob:') && copy.audio_url) {
          delete copy.local_audio_uri;
        }
        return copy;
      });
      await AsyncStorage.setItem(MESSAGES_KEY(chatId), JSON.stringify(sanitized));
      await AsyncStorage.setItem(LAST_SYNC_KEY(chatId), Date.now().toString());
    } catch (error) {
      console.error('❌ Error saving messages locally:', error);
    }
  },

  getMessages: async (chatId: string) => {
    try {
      const stored = await AsyncStorage.getItem(MESSAGES_KEY(chatId));
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ Error loading local messages:', error);
      return [];
    }
  },

  getLastSync: async (chatId: string) => {
    try {
      const stored = await AsyncStorage.getItem(LAST_SYNC_KEY(chatId));
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      console.error('❌ Error getting last sync:', error);
      return 0;
    }
  },

  clearMessages: async (chatId: string) => {
    try {
      await AsyncStorage.removeItem(MESSAGES_KEY(chatId));
      await AsyncStorage.removeItem(LAST_SYNC_KEY(chatId));
    } catch (error) {
      console.error('❌ Error clearing local messages:', error);
    }
  },

  saveDraft: async (chatId: string, draft: string) => {
    try {
      const key = DRAFT_KEY(chatId);
      if (draft.trim()) {
        await AsyncStorage.setItem(key, draft);
      } else {
        await AsyncStorage.removeItem(key);
      }
    } catch (error) {
      console.error('❌ Error saving draft:', error);
    }
  },

  getDraft: async (chatId: string): Promise<string> => {
    try {
      return (await AsyncStorage.getItem(DRAFT_KEY(chatId))) ?? '';
    } catch (error) {
      console.error('❌ Error loading draft:', error);
      return '';
    }
  },

  clearDraft: async (chatId: string) => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEY(chatId));
    } catch (error) {
      console.error('❌ Error clearing draft:', error);
    }
  },

  /** Durable offline send queue (survives app restart). */
  enqueueOutbox: async (item: MessageOutboxItem) => {
    try {
      const items = await readOutbox();
      const next = items.filter((x) => x.client_message_id !== item.client_message_id);
      next.push(item);
      await writeOutbox(next);
    } catch (error) {
      console.error('❌ Error enqueueing outbox:', error);
    }
  },

  removeOutbox: async (clientMessageId: string) => {
    try {
      const items = await readOutbox();
      await writeOutbox(items.filter((x) => x.client_message_id !== clientMessageId));
    } catch (error) {
      console.error('❌ Error removing outbox item:', error);
    }
  },

  getOutbox: async (chatId?: string): Promise<MessageOutboxItem[]> => {
    const items = await readOutbox();
    if (!chatId) return items;
    return items.filter((x) => x.chatId === chatId);
  },

  /** Clear all account-scoped chat state on sign-out. */
  clearAll: async () => {
    try {
      const all = await AsyncStorage.getAllKeys();
      const keys = all.filter(
        (key) =>
          key.startsWith('messages_') ||
          key.startsWith('last_sync_') ||
          key.startsWith('draft_') ||
          key === OUTBOX_KEY
      );
      if (keys.length) await AsyncStorage.multiRemove(keys);
    } catch (error) {
      console.error('❌ Error clearing local chat storage:', error);
    }
  },
};
