// src/hooks/useGroupList.ts
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export type Group = {
  id: string;
  name: string;
  avatar_url?: string;
  member_count: number;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
  user_role?: 'creator' | 'admin' | 'member';
  description?: string;
  is_public?: boolean;
  creator_id?: string;
  created_at?: string;
  updated_at?: string;
};

// Storage
const KEY_GROUPS = '@groups_list_v1';
const KEY_TIMESTAMP = '@groups_list_timestamp_v1';

export const useGroupList = (searchQuery: string = '') => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isDataStale, setIsDataStale] = useState(false);

  // Listen to network
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(Boolean(state.isConnected));
    });
    return () => unsub();
  }, []);

  // Load local cache
  const loadCache = async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY_GROUPS);
      const timestamp = await AsyncStorage.getItem(KEY_TIMESTAMP);

      if (raw && timestamp) {
        const fiveMin = Date.now() - 5 * 60 * 1000;
        setIsDataStale(Number(timestamp) < fiveMin);
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Cache load error:', e);
    }
    return null;
  };

  const saveCache = async (data: Group[]) => {
    try {
      await AsyncStorage.setItem(KEY_GROUPS, JSON.stringify(data));
      await AsyncStorage.setItem(KEY_TIMESTAMP, Date.now().toString());
    } catch (e) {
      console.error('Cache save error:', e);
    }
  };

  // ----------- FETCH GROUPS -----------
  const fetchGroups = useCallback(
    async (forceRefresh = false) => {
      if (!user?.id) {
        setGroups([]);
        setLoading(false);
        return;
      }

      try {
        const net = await NetInfo.fetch();
        const online = Boolean(net.isConnected);
        setIsOnline(online);

        // Load from cache if not forcing refresh
        if (!forceRefresh) {
          const cached = await loadCache();
          if (cached) setGroups(cached);

          if (!online) {
            setLoading(false);
            return;
          }
        }

        setLoading(true);

        console.log('Fetching groups for user:', user.id);

        // 1. CREATOR GROUPS
        const creatorRes = await supabase
          .from('groups')
          .select('*')
          .eq('creator_id', user.id);

        if (creatorRes.error) throw creatorRes.error;

        // 2. MEMBER GROUPS
        const memberRes = await supabase
          .from('group_members')
          .select(`
            group_id,
            role,
            groups!inner (
              id,
              name,
              avatar_url,
              description,
              is_public,
              creator_id,
              created_at,
              updated_at
            )
          `)
          .eq('user_id', user.id);

        if (memberRes.error) throw memberRes.error;

        const groupsMap = new Map<string, any>();

        // Add creator groups
        creatorRes.data?.forEach(g => {
          groupsMap.set(g.id, {
            ...g,
            user_role: 'creator'
          });
        });

        // Add member groups
        memberRes.data?.forEach(row => {
          const g = row.groups;
          if (!g) return;

          if (!groupsMap.has(g.id)) {
            groupsMap.set(g.id, {
              ...g,
              user_role: row.role === 'admin' ? 'admin' : 'member'
            });
          }
        });

        const allGroups = Array.from(groupsMap.values());
        if (allGroups.length === 0) {
          await saveCache([]);
          setGroups([]);
          setLoading(false);
          return;
        }

        const groupIds = allGroups.map(g => g.id);

        // 3. MEMBER COUNTS
        const countRes = await supabase
          .from('group_members')
          .select('group_id')
          .in('group_id', groupIds);

        const countMap = new Map<string, number>();
        countRes.data?.forEach(row => {
          countMap.set(row.group_id, (countMap.get(row.group_id) || 0) + 1);
        });

        allGroups.forEach(g => {
          if (g.user_role === 'creator') {
            countMap.set(g.id, (countMap.get(g.id) || 0) + 1);
          }
        });

        // 4. LAST MESSAGES
        const msgRes = await supabase
          .from('messages')
          .select('*')
          .in('group_id', groupIds)
          .order('created_at', { ascending: false });

        const formatted: Group[] = allGroups.map(g => {
          const msgs = msgRes.data?.filter(m => m.group_id === g.id) || [];
          const latest = msgs[0];

          const unread = msgs.filter(
            m => m.sender_id !== user.id && !m.is_read
          ).length;

          return {
            ...g,
            member_count: countMap.get(g.id) || 1,
            last_message: latest?.content,
            last_message_at: latest?.created_at,
            unread_count: unread
          };
        });

        // Sort by activity
        formatted.sort((a, b) => {
          const ta = a.last_message_at
            ? new Date(a.last_message_at).getTime()
            : new Date(a.created_at || 0).getTime();
          const tb = b.last_message_at
            ? new Date(b.last_message_at).getTime()
            : new Date(b.created_at || 0).getTime();
          return tb - ta;
        });

        await saveCache(formatted);
        setGroups(formatted);
        setIsDataStale(false);
      } catch (err) {
        console.error('Fetch error:', err);

        const cached = await loadCache();
        if (cached) setGroups(cached);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  // Initial fetch
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // ---------- REAL-TIME ----------
  useEffect(() => {
    if (!user?.id || !isOnline) return;

    const gIds = groups.map(g => g.id);
    if (gIds.length === 0) return;

    const channel = supabase
      .channel('group-list-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_members',
          filter: `user_id=eq.${user.id}`
        },
        () => fetchGroups(true)
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `group_id=in.(${gIds.join(',')})`
        },
        () => fetchGroups(true)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [groups, user?.id, isOnline, fetchGroups]);

  // --------- SEARCH ---------
  const filtered = searchQuery.trim()
    ? groups.filter(g =>
        (g.name + ' ' + (g.description || '') + ' ' + (g.last_message || ''))
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : groups;

  const refresh = () => {
    if (!isOnline) return;
    setRefreshing(true);
    fetchGroups(true);
  };

  return {
    groups: filtered,
    loading,
    refreshing,
    refresh,
    isOnline,
    isDataStale
  };
};
