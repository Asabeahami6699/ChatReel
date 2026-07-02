import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { chatTheme } from './chatTheme';

export type ForwardTarget = {
  chatId: string;
  chatType: 'individual' | 'group';
  chatName: string;
  avatarUrl?: string;
};

type ChatRow = ForwardTarget & {
  key: string;
  subtitle?: string;
};

type Props = {
  visible: boolean;
  excludeChatId?: string;
  excludeChatType?: 'individual' | 'group';
  onClose: () => void;
  onSelect: (target: ForwardTarget) => void;
};

export function ForwardToChatPicker({
  visible,
  excludeChatId,
  excludeChatType,
  onClose,
  onSelect,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ChatRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ chats }, { groups }] = await Promise.all([
        api.chats.individual(),
        api.chats.groups(),
      ]);

      const individuals = (chats as Array<Record<string, unknown>>).map((c) => ({
        key: `i-${c.user_id ?? c.id}`,
        chatId: String(c.user_id ?? c.id),
        chatType: 'individual' as const,
        chatName: String(c.name || 'Friend'),
        avatarUrl: (c.avatar_url as string) || undefined,
        subtitle: (c.last_message as string) || undefined,
      }));

      const groupRows = (groups as Array<Record<string, unknown>>).map((g) => ({
        key: `g-${g.id}`,
        chatId: String(g.id),
        chatType: 'group' as const,
        chatName: String(g.name || 'Group'),
        avatarUrl: (g.avatar_url as string) || undefined,
        subtitle: (g.last_message as string) || undefined,
      }));

      setRows([...individuals, ...groupRows]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setQuery('');
      void load();
    }
  }, [visible, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        excludeChatId &&
        excludeChatType &&
        r.chatId === excludeChatId &&
        r.chatType === excludeChatType
      ) {
        return false;
      }
      if (!q) return true;
      return r.chatName.toLowerCase().includes(q);
    });
  }, [rows, query, excludeChatId, excludeChatType]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Forward to</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={chatTheme.primary} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.key}
            ListEmptyComponent={
              <Text style={styles.empty}>No chats available to forward to</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Image
                  source={{ uri: item.avatarUrl || 'https://via.placeholder.com/44' }}
                  style={styles.avatar}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.name}>{item.chatName}</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {item.chatType === 'group' ? 'Group' : 'Chat'}
                    {item.subtitle ? ` · ${item.subtitle}` : ''}
                  </Text>
                </View>
                <Ionicons
                  name={item.chatType === 'group' ? 'people' : 'chatbubble-outline'}
                  size={18}
                  color="#aaa"
                />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: chatTheme.headerBg,
    paddingTop: 48,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 16 },
  loader: { marginTop: 40 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eee' },
  rowBody: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#111' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
});
