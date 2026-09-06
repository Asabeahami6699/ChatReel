import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../../context/ChatSettingsContext';
import type { ChatListMessage } from './chatListModel';
import { getMessageDisplayText } from '../../lib/messageCrypto';

type Props = {
  visible: boolean;
  messages: ChatListMessage[];
  onClose: () => void;
  onSelect: (messageId: string) => void;
};

function previewFor(message: ChatListMessage): string {
  if (message.message_type === 'text' || !message.message_type) {
    return getMessageDisplayText(message) || '';
  }
  return message.file_name || `[${message.message_type}]`;
}

export function ChatSearchOverlay({ visible, messages, onClose, onSelect }: Props) {
  const { theme } = useChatSettings();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const sheetWidth = Math.min(420, Math.max(280, windowWidth - 48));
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => {
        const text = previewFor(m).toLowerCase();
        const sender = (m.profiles?.display_name || '').toLowerCase();
        return text.includes(q) || sender.includes(q);
      })
      .slice(-60)
      .reverse();
  }, [messages, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              width: sheetWidth,
              paddingTop: insets.top + 8,
              backgroundColor: theme.listCardBg,
              borderColor: theme.listBorder,
            },
          ]}
        >
          <View style={[styles.searchRow, { backgroundColor: theme.searchBg, borderColor: theme.listBorder }]}>
            <Ionicons name="search" size={18} color={theme.searchPlaceholder} />
            <TextInput
              style={[styles.input, { color: theme.searchText }]}
              placeholder="Search in this chat"
              placeholderTextColor={theme.searchPlaceholder}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={theme.searchPlaceholder} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.hint, { color: theme.listSecondaryText }]}>
            {query.trim()
              ? `${results.length} result${results.length === 1 ? '' : 's'}`
              : 'Start typing to find messages'}
          </Text>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              results.length === 0 ? styles.emptyList : styles.listContent
            }
            ListEmptyComponent={
              query.trim() ? (
                <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
                  No messages found
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: theme.listBorder }]}
                activeOpacity={0.75}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
              >
                <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.avatarLetter}>
                    {(item.profiles?.display_name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowMeta, { color: theme.listSecondaryText }]} numberOfLines={1}>
                    {item.profiles?.display_name || 'Unknown'} ·{' '}
                    {new Date(item.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text numberOfLines={2} style={[styles.rowText, { color: theme.listPrimaryText }]}>
                    {previewFor(item)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.listSecondaryText} />
              </TouchableOpacity>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    alignSelf: 'center',
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '78%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  cancelBtn: { marginLeft: 2 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  hint: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  listContent: { paddingBottom: 12 },
  emptyList: { paddingVertical: 28 },
  empty: { textAlign: 'center', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowBody: { flex: 1, minWidth: 0 },
  rowMeta: { fontSize: 12, marginBottom: 3 },
  rowText: { fontSize: 15, lineHeight: 20 },
});
