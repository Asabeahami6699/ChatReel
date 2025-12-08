// src/hooks/useIndividualChats.ts
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

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

  const fetchChats = useCallback(async (forceRefresh = false) => {
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

      setLoading(true);

      // Get current user's profile
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!currentProfile) {
        await saveChatsToStorage([]);
        setChats([]);
        setLoading(false);
        return;
      }

      // Get accepted friendships
      const { data: friendships } = await supabase
        .from('friendships')
        .select(`
          id, user_id, friend_id,
          profiles_sender:profiles!friendships_user_id_fkey (user_id, display_name, avatar_url),
          profiles_receiver:profiles!friendships_friend_id_fkey (user_id, display_name, avatar_url)
        `)
        .or(`user_id.eq.${currentProfile.id},friend_id.eq.${currentProfile.id}`)
        .eq('status', 'accepted');

      if (!friendships?.length) {
        await saveChatsToStorage([]);
        setChats([]);
        setLoading(false);
        return;
      }

      // Process friends
      const friendsMap = new Map();
      friendships.forEach(f => {
        const isSender = f.user_id === currentProfile.id;
        const profile = isSender ? f.profiles_receiver : f.profiles_sender;
        if (profile && !friendsMap.has(profile.user_id)) {
          friendsMap.set(profile.user_id, {
            user_id: profile.user_id,
            name: profile.display_name || 'User',
            avatar_url: profile.avatar_url || 'https://via.placeholder.com/48',
          });
        }
      });

      const friends = Array.from(friendsMap.values());
      const friendIds = friends.map(f => f.user_id);

      // Get messages with these friends
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.in.(${friendIds.join(',')})),and(sender_id.in.(${friendIds.join(',')}),receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: false })
        .limit(100); // Limit for performance

      // Process chats
      const formatted: IndividualChat[] = friends.map(friend => {
        const friendMsgs = messages?.filter(m =>
          (m.sender_id === user.id && m.receiver_id === friend.user_id) ||
          (m.sender_id === friend.user_id && m.receiver_id === user.id)
        ) || [];

        const latest = friendMsgs[0];
        const unread = friendMsgs.filter(m => 
          m.sender_id === friend.user_id && !m.is_read
        ).length;

        return {
          id: friend.user_id,
          user_id: friend.user_id,
          name: friend.name,
          avatar_url: friend.avatar_url,
          last_message: latest?.content,
          last_message_at: latest?.created_at,
          unread_count: unread,
        };
      });

      // Sort by last message time
      formatted.sort((a, b) => {
        const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return timeB - timeA;
      });

      // Save to storage
      await saveChatsToStorage(formatted);
      
      // Update state
      setChats(formatted);
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

  // Filter chats by search query (client-side)
  const filteredChats = searchQuery.trim() 
    ? chats.filter(chat =>
        chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  // Real-time subscription (only when online)
  useEffect(() => {
    if (!user?.id || !isOnline) return;

    const channel = supabase
      .channel('individual-chat-updates')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'messages',
          filter: `or(and(sender_id.eq.${user.id},receiver_id.not.eq.${user.id}),and(receiver_id.eq.${user.id},sender_id.not.eq.${user.id}))`
        },
        () => {
          setTimeout(() => fetchChats(true), 1000);
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'friendships'
        },
        () => {
          setTimeout(() => fetchChats(true), 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isOnline]);

  const refresh = () => {
    if (!isOnline) {
      console.log('Cannot refresh while offline');
      return;
    }
    setRefreshing(true);
    fetchChats(true);
  };

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
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('sender_id', partnerUserId)
        .eq('receiver_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

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