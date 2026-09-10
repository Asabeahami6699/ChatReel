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
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OfflineAvatar } from '../../components/OfflineAvatar';
import { api } from '../../lib/api';
import { useChatSettings } from '../../context/ChatSettingsContext';

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
  const { theme } = useChatSettings();
  const insets = useSafeAreaInsets();
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.listBg,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
        <View style={[styles.header, { backgroundColor: theme.headerBg, paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={theme.headerText} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.headerText }]}>Forward to</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={[styles.searchWrap, { backgroundColor: theme.inputBarBg }]}>
          <Ionicons name="search" size={18} color={theme.listSecondaryText} />
          <TextInput
            style={[styles.searchInput, { color: theme.searchText }]}
            placeholder="Search chats"
            placeholderTextColor={theme.searchPlaceholder}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={theme.primary} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.key}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
                No chats available to forward to
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: theme.listBorder }]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <OfflineAvatar
                  uri={item.avatarUrl}
                  name={item.chatName}
                  size={44}
                  style={[styles.avatar, { backgroundColor: theme.listBorder }]}
                />
                <View style={styles.rowBody}>
                  <Text style={[styles.name, { color: theme.listPrimaryText }]}>{item.chatName}</Text>
                  <Text
                    style={[styles.subtitle, { color: theme.listSecondaryText }]}
                    numberOfLines={1}
                  >
                    {item.chatType === 'group' ? 'Group' : 'Chat'}
                    {item.subtitle ? ` · ${item.subtitle}` : ''}
                  </Text>
                </View>
                <Ionicons
                  name={item.chatType === 'group' ? 'people' : 'chatbubble-outline'}
                  size={18}
                  color={theme.listSecondaryText}
                />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  container: {
    maxHeight: '92%',
    minHeight: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 16 },
  loader: { marginTop: 40 },
  empty: { textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  rowBody: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 13, marginTop: 2 },
});
