// src/hooks/useGroupList.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../lib/api';
import { useAuth } from './useAuth';
import { useRealtimeTopic } from './useRealtimeTopic';
import { subscribeChatListMessageEvents } from '../lib/chatListRealtimeBridge';

export type Group = {
  id: string;
  name: string;
  avatar_url?: string | null;
  member_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count: number;
  user_role?: 'creator' | 'admin' | 'member';
  description?: string | null;
  is_public?: boolean | null;
  creator_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_sender?: string | null;
  last_message_sender_display_name?: string;
};

const KEY_GROUPS = '@groups_list_v2';
const KEY_TIMESTAMP = '@groups_list_timestamp_v2';
const GROUP_LAST_MESSAGES_KEY = '@group_last_messages_v2_';
const USER_PROFILES_KEY = '@user_profiles_cache_v2_';

const PROFILE_INVALID_NAMES = new Set(['', 'Unknown User', 'Member']);

export const useGroupList = (searchQuery = '') => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isDataStale, setIsDataStale] = useState(false);

  // -----------------------
  // Storage helpers
  // -----------------------
  const userSuffix = user?.id ?? 'anon';

  const saveJSON = async (key: string, value: any) => {
    try {
      await AsyncStorage.setItem(key + userSuffix, JSON.stringify(value));
    } catch (e) {
      console.error('[useGroupList] saveJSON error:', e);
    }
  };

  const loadJSON = async (key: string) => {
    try {
      const raw = await AsyncStorage.getItem(key + userSuffix);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('[useGroupList] loadJSON error:', e);
      return null;
    }
  };

  const saveGroupLastMessages = async (data: Record<string, any>) =>
    saveJSON(GROUP_LAST_MESSAGES_KEY, data);
  const loadGroupLastMessages = async () => (await loadJSON(GROUP_LAST_MESSAGES_KEY)) || {};

  const saveUserProfilesCache = async (data: Record<string, any>) =>
    saveJSON(USER_PROFILES_KEY, data);
  const loadUserProfilesCache = async () => (await loadJSON(USER_PROFILES_KEY)) || {};

  // -----------------------
  // Utility to normalise display name
  // -----------------------
  const normalizeDisplayName = (profile: { display_name?: string | null; email?: string | null }) => {
    const dn = (profile?.display_name || '').trim();
    if (dn && !PROFILE_INVALID_NAMES.has(dn)) return dn;
    if (profile?.email) return profile.email.split('@')[0];
    return 'Member';
  };

  // -----------------------
  // Fetch user profiles (with caching)
  // -----------------------
  const fetchUserProfiles = useCallback(
    async (userIds: string[] = []) => {
      if (!userIds || userIds.length === 0) return {};
      try {
        const cached = (await loadUserProfilesCache()) || {};
        // find which ids we need to fetch
        const toFetch = userIds.filter(id => !cached[id]);
        if (toFetch.length === 0) return cached;

        // Fetch display_name, avatar_url, email for needed user ids
        const { profiles } = await api.profiles.batch(toFetch);

        const updated = { ...cached };
        (profiles || []).forEach((p: any) => {
          updated[p.user_id] = {
            display_name: normalizeDisplayName(p),
            avatar_url: p.avatar_url ?? null
          };
        });

        // Ensure defaults for any still-missing users
        toFetch.forEach(id => {
          if (!updated[id]) updated[id] = { display_name: 'Member', avatar_url: null };
        });

        await saveUserProfilesCache(updated);
        return updated;
      } catch (e) {
        console.error('[useGroupList] fetchUserProfiles error:', e);
        return (await loadUserProfilesCache()) || {};
      }
    },
    [user?.id]
  );

  // -----------------------
  // Get current user's display name (cached)
  // -----------------------
  const getCurrentUserDisplayName = useCallback(async () => {
    if (!user?.id) return 'You';
    try {
      const cached = await loadUserProfilesCache();
      if (cached[user.id]?.display_name) return cached[user.id].display_name;
      const { profile: data } = await api.profiles.me();
      if (!data) {
        return 'You';
      }

      const dn = normalizeDisplayName({
        display_name: data.display_name as string,
        email: data.email as string,
      });
      const updated = { ...(await loadUserProfilesCache()), [user.id]: { display_name: dn, avatar_url: data?.avatar_url ?? null } };
      await saveUserProfilesCache(updated);
      return dn;
    } catch (e) {
      console.error('[useGroupList] getCurrentUserDisplayName:', e);
      return 'You';
    }
  }, [user?.id]);

  // -----------------------
  // Read/Write full groups cache
  // -----------------------
  const loadGroupsCache = useCallback(async (): Promise<Group[] | null> => {
    const raw = await loadJSON(KEY_GROUPS);
    const ts = await loadJSON(KEY_TIMESTAMP);
    if (raw && ts) {
      const fiveMin = Date.now() - 5 * 60 * 1000;
      setIsDataStale(Number(ts) < fiveMin);
      return raw as Group[];
    }
    return null;
  }, []);

  const saveGroupsCache = useCallback(async (data: Group[]) => {
    await saveJSON(KEY_GROUPS, data);
    await saveJSON(KEY_TIMESTAMP, Date.now());
  }, []);

  // -----------------------
  // Mark messages in group as read
  // -----------------------
  const markGroupMessagesAsRead = useCallback(
    async (groupId: string) => {
      if (!user?.id) return;
      try {
        const { error } = await api.messages.markRead({ group_id: groupId }).then(
          () => ({ error: null }),
          (e) => ({ error: e })
        );

        if (error) console.error('[useGroupList] markGroupMessagesAsRead error:', error);

        // update caches & state
        const lastMessages = await loadGroupLastMessages();
        if (lastMessages[groupId]) {
          lastMessages[groupId].unread_count = 0;
          await saveGroupLastMessages(lastMessages);
        }
        setGroups(prev => prev.map(g => (g.id === groupId ? { ...g, unread_count: 0 } : g)));
      } catch (e) {
        console.error('[useGroupList] markGroupMessagesAsRead catch:', e);
      }
    },
    [user?.id]
  );

  // -----------------------
  // Main fetchGroups implementation
  // -----------------------
  const fetchGroups = useCallback(
    async (forceRefresh = false, silent = false) => {
      if (!user?.id) {
        setGroups([]);
        setLoading(false);
        return;
      }
      try {
        const net = await NetInfo.fetch();
        const online = Boolean(net.isConnected);
        setIsOnline(online);

        // If offline, try cache and bail
        if (!online) {
          const cached = await loadGroupsCache();
          if (cached) setGroups(cached);
          setLoading(false);
          return;
        }

        // Load cache for instant UI if not forcing refresh
        if (!forceRefresh) {
          const cached = await loadGroupsCache();
          if (cached) setGroups(cached);
        }

        // Silent refreshes (realtime-driven) shouldn't flash the loading state.
        if (!silent) setLoading(true);

        const { groups: formatted } = await api.chats.groups();

        try {
          const lastMessagesCache: Record<string, unknown> = {};
          (formatted as Group[]).forEach((g) => {
            lastMessagesCache[g.id] = {
              message: g.last_message,
              timestamp: g.last_message_at,
              unread_count: g.unread_count,
              sender_display_name: g.last_message_sender_display_name,
            };
          });
          await Promise.all([
            saveGroupLastMessages(lastMessagesCache),
            saveGroupsCache(formatted as Group[]),
          ]);
        } catch (e) {
          console.warn('[useGroupList] cache save warning:', e);
        }

        setGroups(formatted as Group[]);
        setIsDataStale(false);
      } catch (err) {
        console.error('[useGroupList] fetchGroups error:', err);
        setIsDataStale(true);
        const cached = await loadGroupsCache();
        if (cached) setGroups(cached);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  // -----------------------
  // Initial load (cache-first) and profiles cache load/cleanup
  // -----------------------
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!mounted) return;
      const cachedGroups = await loadGroupsCache();
      const lastMsgs = await loadGroupLastMessages();
      if (cachedGroups) {
        // apply last messages from last message cache (fast)
        const enhanced = cachedGroups.map((g: Group) => ({
          ...g,
          last_message: lastMsgs[g.id]?.message ?? g.last_message,
          last_message_at: lastMsgs[g.id]?.timestamp ?? g.last_message_at,
          unread_count: lastMsgs[g.id]?.unread_count ?? g.unread_count ?? 0,
          last_message_sender_display_name: lastMsgs[g.id]?.sender_display_name ?? g.last_message_sender_display_name
        }));
        setGroups(enhanced);
      }

      // load profiles cache (no-op if none)
      const profilesCache = await loadUserProfilesCache();
      if (!profilesCache || Object.keys(profilesCache).length === 0) {
        // No heavy work here; fetchUserProfiles will fill it when needed.
      } else {
        // Optional: small cleanup if needed. We don't mutate here unless necessary.
      }

      // then fetch fresh if online
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        fetchGroups();
      } else {
        setLoading(false);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Group metadata changes (name, avatar, members) — refetch once.
  useRealtimeTopic('groups', () => { if (isOnline) fetchGroups(true, true); }, Boolean(user?.id));
  useRealtimeTopic('groupMembers', () => { if (isOnline) fetchGroups(true, true); }, Boolean(user?.id));

  // ---------------------------------------------------------------------------
  // Realtime: uses the global hub dispatch (subscribeToMessageRows) — the same
  // proven channel that useChatRoomRealtime relies on as its backup source.
  // Row-by-row state updates — never a full refetch, so no blink.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.id) return;

    return subscribeChatListMessageEvents(({ row, event }) => {
      if (event !== 'INSERT') return;
      const groupId = row.group_id as string | undefined;
      if (!groupId) return;
      const senderId = row.sender_id as string | undefined;
      if (!senderId) return;

      const content = String(row.content ?? '');
      const createdAt = String(row.created_at ?? new Date().toISOString());
      const isIncoming = senderId !== user.id;

      setGroups((prev) => {
        const idx = prev.findIndex((g) => g.id === groupId);
        if (idx < 0) {
          void fetchGroups(true, true);
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
        return [updated, ...next];
      });
    });
  }, [user?.id, fetchGroups]);

  // -----------------------
  // Search filter (client-side)
  // -----------------------
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.trim().toLowerCase();
    return groups.filter(g =>
      ((g.name || '') + ' ' + (g.description || '') + ' ' + (g.last_message || '') + ' ' + (g.last_message_sender_display_name || ''))
        .toLowerCase()
        .includes(q)
    );
  }, [groups, searchQuery]);

  // refresh wrapper
  const refresh = useCallback(() => {
    if (!isOnline) return;
    setRefreshing(true);
    fetchGroups(true);
  }, [isOnline, fetchGroups]);

  return {
    groups: filtered,
    loading,
    refreshing,
    refresh,
    isOnline,
    isDataStale,
    markGroupMessagesAsRead
  };
};
