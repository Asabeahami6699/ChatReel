// src/hooks/useIndividualChats.ts
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../lib/api';
import { useAuth } from './useAuth';
import { useCurrentProfileId } from './useCurrentProfileId';
import { useFriendshipsRealtime } from './useFriendshipsRealtime';
import { useRealtimeTopic } from './useRealtimeTopic';

export type IndividualChat = {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
};

// Storage keys
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

  // Check network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected || false);
    });
    return () => unsubscribe();
  }, []);

  // Save chats to storage
  const saveChatsToStorage = async (chatsData: IndividualChat[]) => {
    try {
      await AsyncStorage.setItem(INDIVIDUAL_CHATS_STORAGE_KEY, JSON.stringify(chatsData));
      await AsyncStorage.setItem(INDIVIDUAL_CHATS_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error saving chats to storage:', error);
    }
  };

  // Load chats from storage
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
      // Check network status
      const netInfo = await NetInfo.fetch();
      const online = netInfo.isConnected;
      setIsOnline(online || false);

      // Load cached data first (unless forcing refresh)
      if (!forceRefresh) {
        const cachedChats = await loadChatsFromStorage();
        if (cachedChats) {
          setChats(cachedChats);
          setIsDataStale(false);
        }

        // If offline, don't try to fetch from network
        if (!online) {
          console.log('Offline mode - using cached individual chats');
          setLoading(false);
          return;
        }
      }

      // Silent refreshes (realtime-driven) shouldn't flash the loading state.
      if (!silent) setLoading(true);

      const { chats: formatted } = await api.chats.individual();

      await saveChatsToStorage(formatted as IndividualChat[]);
      setChats(formatted as IndividualChat[]);
      setIsDataStale(false);

    } catch (err) {
      console.error('useIndividualChats error:', err);
      // Try to load from cache if fetch failed
      const cachedChats = await loadChatsFromStorage();
      if (cachedChats) {
        setChats(cachedChats);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useFriendshipsRealtime(profileId, () => fetchChats(true, true));
  useRealtimeTopic('messages', () => fetchChats(true, true), isOnline);

  // Filter chats by search query (client-side)
  const filteredChats = searchQuery.trim() 
    ? chats.filter(chat =>
        chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  const refresh = useCallback(() => {
    if (!isOnline) {
      console.log('Cannot refresh while offline');
      return;
    }
    setRefreshing(true);
    fetchChats(true);
  }, [fetchChats, isOnline]);

  // Mark messages as read
  const markMessagesAsRead = async (partnerUserId: string) => {
    if (!user?.id) return;
    
    try {
      // If offline, update local state only
      if (!isOnline) {
        setChats(prev => prev.map(chat =>
          chat.user_id === partnerUserId ? { ...chat, unread_count: 0 } : chat
        ));
        return;
      }

      // Online - update on server
      await api.messages.markRead({ partner_user_id: partnerUserId });

      // Update local state
      setChats(prev => prev.map(chat =>
        chat.user_id === partnerUserId ? { ...chat, unread_count: 0 } : chat
      ));

      // Update storage
      const updatedChats = chats.map(chat =>
        chat.user_id === partnerUserId ? { ...chat, unread_count: 0 } : chat
      );
      await saveChatsToStorage(updatedChats);

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