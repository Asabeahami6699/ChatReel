// src/utils/messageStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const MESSAGES_KEY = (chatId: string) => `messages_${chatId}`;
const LAST_SYNC_KEY = (chatId: string) => `last_sync_${chatId}`;
const DRAFT_KEY = (chatId: string) => `draft_${chatId}`;

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
      await AsyncStorage.setItem(
        MESSAGES_KEY(chatId), 
        JSON.stringify(sanitized)
      );
      await AsyncStorage.setItem(
        LAST_SYNC_KEY(chatId),
        Date.now().toString()
      );
      console.log(`💾 Saved ${messages.length} messages locally for chat ${chatId}`);
    } catch (error) {
      console.error('❌ Error saving messages locally:', error);
    }
  },

  // Load messages from local storage
  getMessages: async (chatId: string) => {
    try {
      const stored = await AsyncStorage.getItem(MESSAGES_KEY(chatId));
      const messages = stored ? JSON.parse(stored) : [];
      console.log(`📨 Loaded ${messages.length} local messages for chat ${chatId}`);
      return messages;
    } catch (error) {
      console.error('❌ Error loading local messages:', error);
      return [];
    }
  },

  // Get last sync time
  getLastSync: async (chatId: string) => {
    try {
      const stored = await AsyncStorage.getItem(LAST_SYNC_KEY(chatId));
      const lastSync = stored ? parseInt(stored) : 0;
      return lastSync;
    } catch (error) {
      console.error('❌ Error getting last sync:', error);
      return 0;
    }
  },

  // Clear local messages (optional)
  clearMessages: async (chatId: string) => {
    try {
      await AsyncStorage.removeItem(MESSAGES_KEY(chatId));
      await AsyncStorage.removeItem(LAST_SYNC_KEY(chatId));
      console.log(`🧹 Cleared local messages for chat ${chatId}`);
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
};