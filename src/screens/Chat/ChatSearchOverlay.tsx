import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatTheme } from './chatTheme';
import type { ChatListMessage } from './chatListModel';

type Props = {
  visible: boolean;
  messages: ChatListMessage[];
  onClose: () => void;
  onSelect: (messageId: string) => void;
};

export function ChatSearchOverlay({ visible, messages, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => {
        if (m.message_type && m.message_type !== 'text') {
          return (m.file_name || '').toLowerCase().includes(q);
        }
        return (m.content || '').toLowerCase().includes(q);
      })
      .slice(-40)
      .reverse();
  }, [messages, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Search in chat"
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim() ? 'No messages found' : 'Type to search messages'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                onSelect(item.id);
                onClose();
              }}
            >
              <Text style={styles.rowMeta}>
                {item.profiles?.display_name || 'Unknown'} ·{' '}
                {new Date(item.created_at).toLocaleString()}
              </Text>
              <Text numberOfLines={2} style={styles.rowText}>
                {item.message_type === 'text' ? item.content : item.file_name || item.message_type}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: chatTheme.headerBg,
    paddingHorizontal: 12,
    paddingVertical: 14,
    paddingTop: 48,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 6,
  },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowMeta: { fontSize: 12, color: '#888', marginBottom: 4 },
  rowText: { fontSize: 15, color: '#222' },
});
