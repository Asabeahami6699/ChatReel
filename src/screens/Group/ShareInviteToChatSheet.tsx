import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError } from '../../lib/api';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { sendInviteToChat } from '../../lib/shareInviteToChat';
import type { ReelChatTarget } from '../../lib/shareReelToChat';
import { navigateToChat } from '../../navigation/navigateToChat';
import { useChatSettings } from '../../context/ChatSettingsContext';

type ChatPick = ReelChatTarget & { key: string };

type Props = {
  inviteLink: string;
  groupName: string;
  onClose: () => void;
  onSent?: () => void;
};

export default function ShareInviteToChatSheet({
  inviteLink,
  groupName,
  onClose,
  onSent,
}: Props) {
  const myProfileId = useCurrentProfileId();
  const { theme } = useChatSettings();
  const [tab, setTab] = useState<'friends' | 'groups'>('friends');
  const [items, setItems] = useState<ChatPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'friends') {
        const { friendships } = await api.friendships.list('accepted');
        const picks: ChatPick[] = [];
        for (const f of friendships ?? []) {
          const row = f as Record<string, unknown>;
          const isSender = row.user_id === myProfileId;
          const profile = (isSender ? row.receiver_profile : row.sender_profile) as {
            user_id?: string;
            display_name?: string | null;
            email?: string | null;
            avatar_url?: string | null;
          } | null;
          const userId = profile?.user_id;
          if (!userId) continue;
          picks.push({
            key: userId,
            chatType: 'individual',
            chatId: userId,
            chatName:
              profile?.display_name?.trim() ||
              profile?.email?.split('@')[0] ||
              'Friend',
            avatarUrl: profile?.avatar_url ?? undefined,
          });
        }
        setItems(Array.from(new Map(picks.map((p) => [p.key, p])).values()));
      } else {
        const { groups } = await api.groups.list();
        setItems(
          (groups ?? []).map((g) => {
            const row = g as { id: string; name?: string; avatar_url?: string };
            return {
              key: row.id,
              chatType: 'group' as const,
              chatId: row.id,
              chatName: row.name ?? 'Group',
              avatarUrl: row.avatar_url,
            };
          })
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load chats');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, myProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPick = async (target: ChatPick) => {
    if (sendingId) return;
    setSendingId(target.key);
    try {
      await sendInviteToChat(inviteLink, groupName, target, note);
      onSent?.();
      onClose();
      setTimeout(() => navigateToChat(target), 300);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to send invite');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.listBg }]}>
      <View style={[styles.handle, { backgroundColor: theme.listBorder }]} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.listPrimaryText }]}>Send to chat</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color={theme.listPrimaryText} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={[styles.note, { backgroundColor: theme.searchBg, color: theme.searchText }]}
        placeholder="Add a message (optional)"
        placeholderTextColor={theme.searchPlaceholder}
        value={note}
        onChangeText={setNote}
        maxLength={500}
      />

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[
            styles.tab,
            { backgroundColor: tab === 'friends' ? theme.primary : theme.inputBarBg },
          ]}
          onPress={() => setTab('friends')}
        >
          <Text
            style={[
              styles.tabText,
              { color: theme.listSecondaryText },
              tab === 'friends' && styles.tabTextActive,
            ]}
          >
            Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            { backgroundColor: tab === 'groups' ? theme.primary : theme.inputBarBg },
          ]}
          onPress={() => setTab('groups')}
        >
          <Text
            style={[
              styles.tabText,
              { color: theme.listSecondaryText },
              tab === 'groups' && styles.tabTextActive,
            ]}
          >
            Groups
          </Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.key}
          style={styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
              {tab === 'friends' ? 'No friends to message yet' : 'No groups yet'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.listBorder }]}
              onPress={() => void onPick(item)}
              disabled={!!sendingId}
            >
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View
                  style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.listBorder }]}
                >
                  <Ionicons
                    name={item.chatType === 'group' ? 'people' : 'person'}
                    size={18}
                    color={theme.listPrimaryText}
                  />
                </View>
              )}
              <Text style={[styles.rowName, { color: theme.listPrimaryText }]} numberOfLines={1}>
                {item.chatName}
              </Text>
              {sendingId === item.key ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <Ionicons name="send" size={18} color={theme.primary} />
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  note: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabText: { fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { flex: 1, fontSize: 15, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 32 },
  error: { color: '#f87171', marginBottom: 8, fontSize: 13 },
});
