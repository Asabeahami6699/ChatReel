import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatListAvatar } from './ChatListAvatar';
import { useChatSettings } from '../context/ChatSettingsContext';
import { useIndividualChats } from '../hooks/useIndividualChats';
import { useGroupList } from '../hooks/useGroupList';
import { chatListKey, type ChatListEntryKind } from '../lib/chatListHidden';
import { MOBILE_BREAKPOINT } from '../navigation/navigationUtils';

type Props = {
  visible: boolean;
  selectedKeys: string[];
  onClose: () => void;
  onSave: (keys: string[]) => void;
};

type Row = {
  key: string;
  kind: ChatListEntryKind;
  id: string;
  name: string;
  avatarUrl?: string | null;
};

/**
 * Multi-select which conversations require Chat Lock when scope is "selected".
 */
export function ChatLockChatsPicker({ visible, selectedKeys, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useChatSettings();
  const isDesktop = Platform.OS === 'web' && width >= MOBILE_BREAKPOINT;
  const { chats } = useIndividualChats();
  const { groups } = useGroupList();
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedKeys));

  React.useEffect(() => {
    if (visible) setDraft(new Set(selectedKeys));
  }, [visible, selectedKeys]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const c of chats) {
      out.push({
        key: chatListKey('individual', c.user_id),
        kind: 'individual',
        id: c.user_id,
        name: c.name,
        avatarUrl: c.avatar_url,
      });
    }
    for (const g of groups) {
      out.push({
        key: chatListKey('group', g.id),
        kind: 'group',
        id: g.id,
        name: g.name,
        avatarUrl: g.avatar_url,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [chats, groups]);

  const toggle = (key: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.listCardBg,
              paddingBottom: insets.bottom + 12,
              maxWidth: isDesktop ? 420 : undefined,
              width: isDesktop ? '100%' : undefined,
              alignSelf: isDesktop ? 'center' : undefined,
              marginTop: isDesktop ? '8%' : undefined,
              maxHeight: isDesktop ? '80%' : '88%',
              borderTopLeftRadius: isDesktop ? 16 : 18,
              borderTopRightRadius: isDesktop ? 16 : 18,
              borderBottomLeftRadius: isDesktop ? 16 : 0,
              borderBottomRightRadius: isDesktop ? 16 : 0,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.listPrimaryText }]}>
              Chats to lock
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.listSecondaryText} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, { color: theme.listSecondaryText }]}>
            Selected chats require unlock when opened. The rest stay open.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rows.length === 0 ? (
              <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
                No chats yet
              </Text>
            ) : (
              rows.map((row) => {
                const on = draft.has(row.key);
                return (
                  <TouchableOpacity
                    key={row.key}
                    style={styles.row}
                    onPress={() => toggle(row.key)}
                    activeOpacity={0.75}
                  >
                    <ChatListAvatar uri={row.avatarUrl} name={row.name} />
                    <View style={styles.meta}>
                      <Text
                        style={[styles.name, { color: theme.listPrimaryText }]}
                        numberOfLines={1}
                      >
                        {row.name}
                      </Text>
                      <Text style={[styles.kind, { color: theme.listSecondaryText }]}>
                        {row.kind === 'group' ? 'Group' : 'Chat'}
                      </Text>
                    </View>
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={on ? '#5c6bc0' : theme.listSecondaryText}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => onSave(Array.from(draft))}
            activeOpacity={0.85}
          >
            <Text style={styles.saveText}>
              Save{draft.size > 0 ? ` (${draft.size})` : ''}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '800' },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 8, paddingBottom: 8 },
  empty: { textAlign: 'center', paddingVertical: 28, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
  },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700' },
  kind: { fontSize: 12, marginTop: 1 },
  saveBtn: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#5c6bc0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
