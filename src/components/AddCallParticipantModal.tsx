import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type CallDTO } from '../lib/api';
import { useCurrentProfileId } from '../hooks/useCurrentProfileId';
import { supabase } from '../lib/supabase';

type FriendRow = {
  userId: string;
  name: string;
  avatar: string | null;
};

type Props = {
  visible: boolean;
  call: CallDTO;
  onClose: () => void;
  onInvited: () => void;
};

export function AddCallParticipantModal({ visible, call, onClose, onInvited }: Props) {
  const profileId = useCurrentProfileId();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [groupMembers, setGroupMembers] = useState<FriendRow[]>([]);
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myAuthId, setMyAuthId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyAuthId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    if (!visible || !call.id) return;
    setLoading(true);
    setError(null);
    try {
      const [{ participants }, friendsRes, membersRes] = await Promise.all([
        api.calls.participants(call.id),
        profileId
          ? api.friendships.list('accepted')
          : Promise.resolve({ friendships: [] as Record<string, unknown>[] }),
        call.scope === 'group' && call.group_id
          ? api.groups.members(call.group_id)
          : Promise.resolve({ members: [] as Record<string, unknown>[] }),
      ]);

      setExistingIds(
        new Set(participants.map((p) => p.user_id).filter((id) => id !== myAuthId))
      );

      const friendRows: FriendRow[] = [];
      for (const f of friendsRes.friendships ?? []) {
        const row = f as Record<string, unknown>;
        const isSender = row.user_id === profileId;
        const profile = (isSender ? row.receiver_profile : row.sender_profile) as {
          user_id?: string;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
        } | null;
        if (!profile?.user_id || profile.user_id === myAuthId) continue;
        friendRows.push({
          userId: profile.user_id,
          name:
            profile.display_name?.trim() ||
            profile.email?.split('@')[0] ||
            'Friend',
          avatar: profile.avatar_url ?? null,
        });
      }
      setFriends(friendRows);

      const memberRows: FriendRow[] = [];
      for (const m of membersRes.members ?? []) {
        const row = m as Record<string, unknown>;
        const uid = row.user_id as string | undefined;
        const profile = row.profile as {
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
        } | null;
        if (!uid || uid === myAuthId) continue;
        memberRows.push({
          userId: uid,
          name:
            profile?.display_name?.trim() ||
            profile?.email?.split('@')[0] ||
            'Member',
          avatar: profile?.avatar_url ?? null,
        });
      }
      setGroupMembers(memberRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load contacts');
    } finally {
      setLoading(false);
    }
  }, [visible, call.id, call.scope, call.group_id, profileId, myAuthId]);

  useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setQuery('');
      void load();
    }
  }, [visible, load]);

  const pool = call.scope === 'group' ? groupMembers : friends;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter(
      (c) =>
        !existingIds.has(c.userId) &&
        (!q || c.name.toLowerCase().includes(q))
    );
  }, [pool, existingIds, query]);

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.calls.invite(call.id, Array.from(selected));
      onInvited();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not invite participants');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add to call</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Select friends to join (up to 10 total)</Text>
          <TextInput
            style={styles.search}
            placeholder="Search..."
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.userId}
              style={styles.list}
              renderItem={({ item }) => {
                const checked = selected.has(item.userId);
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => toggle(item.userId)}
                  >
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.name}>{item.name}</Text>
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={checked ? '#1976d2' : '#bbb'}
                    />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>No contacts available to invite</Text>
              }
            />
          )}
          <TouchableOpacity
            style={[styles.inviteBtn, (selected.size === 0 || submitting) && styles.inviteBtnDisabled]}
            disabled={selected.size === 0 || submitting}
            onPress={() => void submit()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.inviteBtnText}>
                Invite {selected.size > 0 ? `(${selected.size})` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  hint: { fontSize: 13, color: '#666', paddingHorizontal: 16, paddingTop: 8 },
  search: {
    margin: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  list: { maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontWeight: '700', color: '#555' },
  name: { flex: 1, fontSize: 16, color: '#111' },
  empty: { textAlign: 'center', color: '#888', padding: 24 },
  error: { color: '#c62828', paddingHorizontal: 16, fontSize: 13 },
  inviteBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#1976d2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  inviteBtnDisabled: { opacity: 0.5 },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
