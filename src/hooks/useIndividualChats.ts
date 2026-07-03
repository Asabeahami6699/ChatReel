// src/hooks/useIndividualChats.ts
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../lib/api';
import { useAuth } from './useAuth';
import { useCurrentProfileId } from './useCurrentProfileId';
import { useFriendshipsRealtime } from './useFriendshipsRealtime';
import { subscribeToMessageRows } from '../lib/chatRealtime';

export type IndividualChat = {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
};

const INDIVIDUAL_CHATS_STORAGE_KEY = '@individual_chats';
const INDIVIDUAL_CHATS_TIMESTAMP_KEY = '@individual_chats_timestamp';

export const useIndividualChats = (searchQuery: string = '') => {
  const { user } = useAuth();
  const profileId = useCurrentProfileId();
  const [chats, setChats] = useState<IndividualChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isDataStale, setIsDataStale] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected || false);
    });
    return () => unsubscribe();
  }, []);

  const saveChatsToStorage = async (chatsData: IndividualChat[]) => {
    try {
      await AsyncStorage.setItem(INDIVIDUAL_CHATS_STORAGE_KEY, JSON.stringify(chatsData));
      await AsyncStorage.setItem(INDIVIDUAL_CHATS_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error saving chats to storage:', error);
    }
  };

  const loadChatsFromStorage = async (): Promise<IndividualChat[] | null> => {
    try {
      const storedChats = await AsyncStorage.getItem(INDIVIDUAL_CHATS_STORAGE_KEY);
      const timestamp = await AsyncStorage.getItem(INDIVIDUAL_CHATS_TIMESTAMP_KEY);
      if (storedChats && timestamp) {
        const parsedChats = JSON.parse(storedChats);
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const isStale = parseInt(timestamp) < fiveMinutesAgo;
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
      return;
    }

    try {
      const netInfo = await NetInfo.fetch();
      const online = netInfo.isConnected;
      setIsOnline(online || false);

      if (!forceRefresh) {
        const cachedChats = await loadChatsFromStorage();
        if (cachedChats) {
          setChats(cachedChats);
          setIsDataStale(false);
        }
        if (!online) {
          setLoading(false);
          return;
        }
      }

      if (!silent) setLoading(true);

      const { chats: formatted } = await api.chats.individual();
      await saveChatsToStorage(formatted as IndividualChat[]);
      setChats(formatted as IndividualChat[]);
      setIsDataStale(false);
    } catch (err) {
      console.error('useIndividualChats error:', err);
      const cachedChats = await loadChatsFromStorage();
      if (cachedChats) setChats(cachedChats);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useFriendshipsRealtime(profileId, () => fetchChats(true, true));

  // ---------------------------------------------------------------------------
  // Realtime: uses the global hub dispatch (subscribeToMessageRows) — the same
  // proven channel that useChatRoomRealtime relies on as its backup source.
  // Row-by-row state updates — never a full refetch, so no blink.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.id) return;

    console.log('[chatlist-individual] subscribeToMessageRows attached for', user.id);

    return subscribeToMessageRows((row, event) => {
      // Skip group messages — handled by useGroupList.
      if (row.group_id) return;

      const senderId = row.sender_id as string | undefined;
      const receiverId = row.receiver_id as string | undefined;
      if (!senderId || !receiverId) return;

      const isIncoming = senderId !== user.id && receiverId === user.id;
      const isOutgoing = senderId === user.id && receiverId !== user.id;
      if (!isIncoming && !isOutgoing) return;

      const partnerId = isIncoming ? senderId : receiverId;

      console.log('[chatlist-individual] message event', event, {
        partnerId,
        direction: isIncoming ? 'incoming' : 'outgoing',
        content: String(row.content ?? '').slice(0, 30),
      });

      if (event === 'INSERT') {
        const content = String(row.content ?? '');
        const createdAt = String(row.created_at ?? new Date().toISOString());

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.user_id === partnerId);
          if (idx < 0) {
            console.log('[chatlist-individual] partner not in list, fetching…');
            void fetchChats(true, true);
            return prev;
          }
          const next = [...prev];
          const updated = {
            ...next[idx],
            last_message: content,
            last_message_at: createdAt,
            unread_count: isIncoming
              ? (next[idx].unread_count || 0) + 1
              : next[idx].unread_count,
          };
          next.splice(idx, 1);
          const reordered = [updated, ...next];
          void saveChatsToStorage(reordered);
          console.log('[chatlist-individual] updated chat for', next[0]?.name ?? partnerId);
          return reordered;
        });
      } else if (event === 'UPDATE') {
        const isRead = (row as Record<string, unknown>).is_read;
        if (isRead && isIncoming) {
          setChats((prev) => {
            const idx = prev.findIndex((c) => c.user_id === partnerId);
            if (idx < 0) return prev;
            if (prev[idx].unread_count === 0) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], unread_count: 0 };
            void saveChatsToStorage(next);
            return next;
          });
        }
      }
    });
  }, [user?.id, fetchChats]);

  const filteredChats = searchQuery.trim()
    ? chats.filter(chat =>
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
        setChats(prev => prev.map(chat =>
          chat.user_id === partnerUserId ? { ...chat, unread_count: 0 } : chat
        ));
        return;
      }

      await api.messages.markRead({ partner_user_id: partnerUserId });

      setChats(prev => {
        const next = prev.map(chat =>
          chat.user_id === partnerUserId ? { ...chat, unread_count: 0 } : chat
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
    markMessagesAsRead
  };
};
