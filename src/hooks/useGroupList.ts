// src/hooks/useGroupList.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../lib/api';
import { useAuth } from './useAuth';
import { useRealtimeTopic } from './useRealtimeTopic';
import { subscribeChatListMessageEvents } from '../lib/chatListRealtimeBridge';
import { isEncryptedMessage, resolveChatListPreview } from '../lib/messageCrypto';

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
  last_message_type?: string | null;
  last_message_plaintext?: boolean | null;
  last_message_iv?: string | null;
  last_message_ephemeral_public_key?: string | null;
};

const KEY_GROUPS = '@groups_list_v2';
const KEY_TIMESTAMP = '@groups_list_timestamp_v2';
const GROUP_LAST_MESSAGES_KEY = '@group_last_messages_v2_';
const USER_PROFILES_KEY = '@user_profiles_cache_v2_';

const PROFILE_INVALID_NAMES = new Set(['', 'Unknown User', 'Member']);

async function withDecryptedGroupPreviews(
  groups: Group[],
  myUserId: string | undefined
): Promise<Group[]> {
  if (!myUserId || groups.length === 0) return groups;
  return Promise.all(
    groups.map(async (group) => {
      const preview = await resolveChatListPreview(
        {
          content: group.last_message,
          message_type: group.last_message_type ?? 'text',
          plaintext: group.last_message_plaintext,
          iv: group.last_message_iv,
          ephemeral_public_key: group.last_message_ephemeral_public_key,
          sender_id: group.last_message_sender,
          group_id: group.id,
        },
        myUserId
      );
      if (preview === group.last_message) return group;
      return { ...group, last_message: preview };
    })
  );
}

/** Keep group avatar/name stable across message-driven refetches unless metadata changed. */
function mergeGroupsPreservingProfiles(prev: Group[], next: Group[]): Group[] {
  if (!prev.length) return next;
  const prevById = new Map(prev.map((g) => [g.id, g]));
  return next.map((group) => {
    const old = prevById.get(group.id);
    if (!old) return group;
    const avatarChanged =
      Boolean(group.avatar_url) &&
      (group.avatar_url || '').split('?')[0] !== (old.avatar_url || '').split('?')[0];
    const nameChanged = Boolean(group.name) && group.name !== old.name;
    return {
      ...group,
      avatar_url: avatarChanged ? group.avatar_url : old.avatar_url,
      name: nameChanged ? group.name : old.name,
    };
  });
}

export const useGroupList = (searchQuery = '') => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isDataStale, setIsDataStale] = useState(false);
  const paintedLocalRef = useRef(false);
  const safetyRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        paintedLocalRef.current = false;
        return;
      }
      try {
        const net = await NetInfo.fetch();
        const online = Boolean(net.isConnected);
        setIsOnline(online);

        // Always paint local first (WhatsApp-style).
        if (!forceRefresh || !paintedLocalRef.current) {
          const cached = await loadGroupsCache();
          if (cached) {
            setGroups(cached);
            paintedLocalRef.current = true;
            setLoading(false);
          }
        }

        if (!online) {
          setLoading(false);
          return;
        }

        // Only flash loading when there is nothing local yet.
        if (!silent && !paintedLocalRef.current) setLoading(true);

        const { groups: formatted } = await api.chats.groups();
        const withPreviews = await withDecryptedGroupPreviews(
          formatted as Group[],
          user.id
        );

        try {
          const lastMessagesCache: Record<string, unknown> = {};
          withPreviews.forEach((g) => {
            lastMessagesCache[g.id] = {
              message: g.last_message,
              timestamp: g.last_message_at,
              unread_count: g.unread_count,
              sender_display_name: g.last_message_sender_display_name,
            };
          });
          await Promise.all([
            saveGroupLastMessages(lastMessagesCache),
          ]);
        } catch (e) {
          console.warn('[useGroupList] cache save warning:', e);
        }

        setGroups((prev) => {
          const merged = mergeGroupsPreservingProfiles(prev, withPreviews);
          void saveGroupsCache(merged);
          return merged;
        });
        paintedLocalRef.current = true;
        setIsDataStale(false);
      } catch (err) {
        console.error('[useGroupList] fetchGroups error:', err);
        setIsDataStale(true);
        const cached = await loadGroupsCache();
        if (cached) {
          setGroups(cached);
          paintedLocalRef.current = true;
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  const scheduleSafetyRefetch = useCallback(() => {
    if (!isOnline) return;
    if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current);
    safetyRefetchTimer.current = setTimeout(() => {
      safetyRefetchTimer.current = null;
      void fetchGroups(true, true);
    }, 1200);
  }, [isOnline, fetchGroups]);

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
  useRealtimeTopic('groups', () => scheduleSafetyRefetch(), Boolean(user?.id));
  useRealtimeTopic('groupMembers', () => scheduleSafetyRefetch(), Boolean(user?.id));
  // Debounced catch-up for missed message rows (avatars preserved via merge).
  useRealtimeTopic('messages', () => scheduleSafetyRefetch(), Boolean(user?.id));

  useEffect(() => {
    if (!user?.id) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchGroups(true, true);
    });
    return () => {
      sub.remove();
      if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current);
    };
  }, [user?.id, fetchGroups]);

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

      const createdAt = String(row.created_at ?? new Date().toISOString());
      const isIncoming = senderId !== user.id;
      const messageType = (row.message_type as string) || 'text';
      const encrypted = isEncryptedMessage({
        content: row.content as string | undefined,
        plaintext: row.plaintext as boolean | null | undefined,
        iv: row.iv as string | null | undefined,
        ephemeral_public_key: row.ephemeral_public_key as string | null | undefined,
      });

      setGroups((prev) => {
        const idx = prev.findIndex((g) => g.id === groupId);
        if (idx < 0) {
          void fetchGroups(true, true);
          return prev;
        }
        const next = [...prev];
        const updated = {
          ...next[idx],
          avatar_url: next[idx].avatar_url,
          name: next[idx].name,
          last_message: encrypted
            ? next[idx].last_message
            : String(row.content ?? next[idx].last_message ?? ''),
          last_message_at: createdAt,
          last_message_sender: senderId,
          last_message_type: messageType,
          last_message_plaintext:
            (row.plaintext as boolean | null | undefined) ?? null,
          last_message_iv: (row.iv as string | null | undefined) ?? null,
          last_message_ephemeral_public_key:
            (row.ephemeral_public_key as string | null | undefined) ?? null,
          unread_count: isIncoming
            ? (next[idx].unread_count || 0) + 1
            : next[idx].unread_count,
        };
        next.splice(idx, 1);
        return [updated, ...next];
      });

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
            group_id: groupId,
          },
          user.id
        ).then((preview) => {
          if (!preview) return;
          setGroups((prev) => {
            const idx = prev.findIndex((g) => g.id === groupId);
            if (idx < 0) return prev;
            if (prev[idx].last_message === preview) return prev;
            if (prev[idx].last_message_at !== createdAt) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              avatar_url: next[idx].avatar_url,
              name: next[idx].name,
              last_message: preview,
            };
            return next;
          });
        });
      }
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
