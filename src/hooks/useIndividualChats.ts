// src/hooks/useIndividualChats.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api, ApiError } from '../lib/api';
import { useAuth } from './useAuth';
import { useCurrentProfileId } from './useCurrentProfileId';
import { useFriendshipsRealtime } from './useFriendshipsRealtime';
import { useRealtimeTopic } from './useRealtimeTopic';
import { subscribeChatListMessageEvents } from '../lib/chatListRealtimeBridge';
import { isEncryptedMessage, resolveChatListPreview } from '../lib/messageCrypto';

export type IndividualChat = {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
  last_message_type?: string;
  last_message_plaintext?: boolean | null;
  last_message_iv?: string | null;
  last_message_ephemeral_public_key?: string | null;
  last_message_sender_id?: string | null;
  last_message_receiver_id?: string | null;
};

const chatsKey = (userId: string) => `@individual_chats:${userId}`;
const chatsTsKey = (userId: string) => `@individual_chats_timestamp:${userId}`;

function avatarPath(url?: string | null) {
  return (url || '').split('?')[0];
}

async function withDecryptedPreviews(
  chats: IndividualChat[],
  myUserId: string | undefined
): Promise<IndividualChat[]> {
  if (!myUserId || chats.length === 0) return chats;
  return Promise.all(
    chats.map(async (chat) => {
      const preview = await resolveChatListPreview(
        {
          content: chat.last_message,
          message_type: chat.last_message_type,
          plaintext: chat.last_message_plaintext,
          iv: chat.last_message_iv,
          ephemeral_public_key: chat.last_message_ephemeral_public_key,
          sender_id: chat.last_message_sender_id,
          receiver_id: chat.last_message_receiver_id,
        },
        myUserId
      );
      if (preview === chat.last_message) return chat;
      return { ...chat, last_message: preview };
    })
  );
}

/** Keep avatar/name stable unless the profile path actually changed. */
function mergeChatsPreservingProfiles(
  prev: IndividualChat[],
  next: IndividualChat[]
): IndividualChat[] {
  if (!prev.length) return next;
  const prevById = new Map(prev.map((c) => [c.user_id, c]));
  return next.map((chat) => {
    const old = prevById.get(chat.user_id);
    if (!old) return chat;
    const avatarChanged =
      Boolean(chat.avatar_url) && avatarPath(chat.avatar_url) !== avatarPath(old.avatar_url);
    const nameChanged = Boolean(chat.name) && chat.name !== old.name;
    const merged: IndividualChat = {
      ...chat,
      avatar_url: avatarChanged ? chat.avatar_url : old.avatar_url,
      name: nameChanged ? chat.name : old.name,
    };
    // Reuse previous object when message fields are unchanged (avoids row remounts).
    if (
      !avatarChanged &&
      !nameChanged &&
      merged.last_message === old.last_message &&
      merged.last_message_at === old.last_message_at &&
      merged.unread_count === old.unread_count
    ) {
      return old;
    }
    return merged;
  });
}

export const useIndividualChats = (searchQuery: string = '') => {
  const { user } = useAuth();
  const profileId = useCurrentProfileId();
  const [chats, setChats] = useState<IndividualChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isDataStale, setIsDataStale] = useState(false);
  const paintedLocalRef = useRef(false);
  const safetyRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected || false);
    });
    return () => unsubscribe();
  }, []);

  const saveChatsToStorage = async (chatsData: IndividualChat[]) => {
    if (!user?.id) return;
    try {
      await AsyncStorage.setItem(chatsKey(user.id), JSON.stringify(chatsData));
      await AsyncStorage.setItem(chatsTsKey(user.id), Date.now().toString());
    } catch (error) {
      console.error('Error saving chats to storage:', error);
    }
  };

  const loadChatsFromStorage = async (): Promise<IndividualChat[] | null> => {
    if (!user?.id) return null;
    try {
      const storedChats = await AsyncStorage.getItem(chatsKey(user.id));
      const timestamp = await AsyncStorage.getItem(chatsTsKey(user.id));
      if (storedChats && timestamp) {
        const parsedChats = JSON.parse(storedChats);
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const isStale = parseInt(timestamp, 10) < fiveMinutesAgo;
        setIsDataStale(isStale);
        return parsedChats;
      }
    } catch (error) {
      console.error('Error loading chats from storage:', error);
    }
    return null;
  };

  const fetchChats = useCallback(async (forceRefresh = false, silent = false) => {
    if (!user?.id) {
      setChats([]);
      setLoading(false);
      paintedLocalRef.current = false;
      return;
    }

    try {
      const netInfo = await NetInfo.fetch();
      const online = netInfo.isConnected;
      setIsOnline(online || false);

      if (!forceRefresh || !paintedLocalRef.current) {
        const cachedChats = await loadChatsFromStorage();
        if (cachedChats) {
          const decoded = await withDecryptedPreviews(cachedChats, user.id);
          setChats(decoded);
          paintedLocalRef.current = true;
          setLoading(false);
        }
        if (!online) {
          setLoading(false);
          return;
        }
      }

      if (!silent && !paintedLocalRef.current) setLoading(true);

      const { chats: formatted } = await api.chats.individual();
      const decoded = await withDecryptedPreviews(
        formatted as IndividualChat[],
        user.id
      );
      setChats((prev) => {
        const merged = mergeChatsPreservingProfiles(prev, decoded);
        void saveChatsToStorage(merged);
        return merged;
      });
      paintedLocalRef.current = true;
      setIsDataStale(false);
    } catch (err) {
      if (!(err instanceof ApiError && err.isAuthError)) {
        console.error('useIndividualChats error:', err);
      }
      const cachedChats = await loadChatsFromStorage();
      if (cachedChats) {
        const decoded = await withDecryptedPreviews(cachedChats, user.id);
        setChats(decoded);
        paintedLocalRef.current = true;
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const scheduleSafetyRefetch = useCallback(() => {
    if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current);
    safetyRefetchTimer.current = setTimeout(() => {
      safetyRefetchTimer.current = null;
      void fetchChats(true, true);
    }, 1200);
  }, [fetchChats]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    if (!user?.id) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchChats(true, true);
    });
    return () => {
      sub.remove();
      if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current);
    };
  }, [user?.id, fetchChats]);

  useFriendshipsRealtime(profileId, () => scheduleSafetyRefetch());

  // Debounced catch-up for missed realtime rows (avatars preserved via merge).
  useRealtimeTopic('messages', () => scheduleSafetyRefetch(), Boolean(user?.id));

  useEffect(() => {
    if (!user?.id) return;

    return subscribeChatListMessageEvents(({ row, event }) => {
      if (row.group_id) return;

      const senderId = row.sender_id as string | undefined;
      const receiverId = row.receiver_id as string | undefined;
      if (!senderId || !receiverId) return;

      const isIncoming = senderId !== user.id && receiverId === user.id;
      const isOutgoing = senderId === user.id && receiverId !== user.id;
      if (!isIncoming && !isOutgoing) return;

      const partnerId = isIncoming ? senderId : receiverId;

      if (event === 'INSERT') {
        const createdAt = String(row.created_at ?? new Date().toISOString());
        const messageType = (row.message_type as string) || 'text';
        const encrypted = isEncryptedMessage({
          content: row.content as string | undefined,
          plaintext: row.plaintext as boolean | null | undefined,
          iv: row.iv as string | null | undefined,
          ephemeral_public_key: row.ephemeral_public_key as string | null | undefined,
        });

        // Immediate UI update — never wait on decrypt for unread / ordering.
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.user_id === partnerId);
          if (idx < 0) {
            void fetchChats(true, true);
            return prev;
          }
          const existing = prev[idx];
          const next = [...prev];
          const updated: IndividualChat = {
            ...existing,
            avatar_url: existing.avatar_url,
            name: existing.name,
            last_message: encrypted
              ? existing.last_message
              : String(row.content ?? existing.last_message ?? ''),
            last_message_at: createdAt,
            last_message_type: messageType,
            last_message_plaintext:
              (row.plaintext as boolean | null | undefined) ?? null,
            last_message_iv: (row.iv as string | null | undefined) ?? null,
            last_message_ephemeral_public_key:
              (row.ephemeral_public_key as string | null | undefined) ?? null,
            last_message_sender_id: senderId,
            last_message_receiver_id: receiverId,
            unread_count: isIncoming
              ? (existing.unread_count || 0) + 1
              : existing.unread_count,
          };
          next.splice(idx, 1);
          const reordered = [updated, ...next];
          void saveChatsToStorage(reordered);
          return reordered;
        });

        // Decrypt preview in the background; only patch last_message text.
        if (encrypted || messageType === 'text') {
          void resolveChatListPreview(
            {
              content: row.content as string | undefined,
              message_type: messageType,
              plaintext: row.plaintext as boolean | null | undefined,
              iv: row.iv as string | null | undefined,
              ephemeral_public_key: row.ephemeral_public_key as
                | string
                | null
                | undefined,
              sender_id: senderId,
              receiver_id: receiverId,
            },
            user.id
          ).then((preview) => {
            if (!preview) return;
            setChats((prev) => {
              const idx = prev.findIndex((c) => c.user_id === partnerId);
              if (idx < 0) return prev;
              if (prev[idx].last_message === preview) return prev;
              // Only apply if this is still the latest message for the row.
              if (prev[idx].last_message_at !== createdAt) return prev;
              const next = [...prev];
              next[idx] = {
                ...next[idx],
                avatar_url: next[idx].avatar_url,
                name: next[idx].name,
                last_message: preview,
              };
              void saveChatsToStorage(next);
              return next;
            });
          });
        }
      } else if (event === 'UPDATE') {
        const isRead = (row as Record<string, unknown>).is_read;
        if (isRead && isIncoming) {
          setChats((prev) => {
            const idx = prev.findIndex((c) => c.user_id === partnerId);
            if (idx < 0) return prev;
            if (prev[idx].unread_count === 0) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              avatar_url: next[idx].avatar_url,
              name: next[idx].name,
              unread_count: 0,
            };
            void saveChatsToStorage(next);
            return next;
          });
        }
      }
    });
  }, [user?.id, fetchChats]);

  const filteredChats = searchQuery.trim()
    ? chats.filter(
        (chat) =>
          chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          chat.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  const refresh = useCallback(() => {
    if (!isOnline) return;
    setRefreshing(true);
    fetchChats(true);
  }, [fetchChats, isOnline]);

  const markMessagesAsRead = async (partnerUserId: string) => {
    if (!user?.id) return;
    try {
      if (!isOnline) {
        setChats((prev) =>
          prev.map((chat) =>
            chat.user_id === partnerUserId ? { ...chat, unread_count: 0 } : chat
          )
        );
        return;
      }

      await api.messages.markRead({ partner_user_id: partnerUserId });

      setChats((prev) => {
        const next = prev.map((chat) =>
          chat.user_id === partnerUserId
            ? { ...chat, avatar_url: chat.avatar_url, name: chat.name, unread_count: 0 }
            : chat
        );
        void saveChatsToStorage(next);
        return next;
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  return {
    chats: filteredChats,
    loading,
    refreshing,
    refresh,
    isOnline,
    isDataStale,
    markMessagesAsRead,
  };
};
