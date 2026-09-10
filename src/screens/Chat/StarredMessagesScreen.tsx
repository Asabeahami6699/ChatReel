import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { useHeaderChrome } from '../../context/AppChromeContext';
import { api } from '../../lib/api';
import { getMessageDisplayText } from '../../lib/messageCrypto';
import { openChat } from '../../navigation/chatNavigationBridge';
import { messageStorage } from '../../utils/messageStorage';

type Item = {
  key: string;
  chatId: string;
  chatType: 'individual' | 'group';
  messageId: string;
  preview: string;
};

export default function StarredMessagesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  useHeaderChrome(theme.headerBg);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      void (async () => {
        const index = await messageStorage.getChatIndex();
        const out: Item[] = [];
        await Promise.all(
          index.map(async (row) => {
            try {
              const { preferences } = await api.chatSettings.get(row.chatType, row.chatId);
              const ids = (preferences.starred_message_ids as string[]) ?? [];
              if (!ids.length) return;
              const set = new Set(ids);
              const messages = (await messageStorage.getMessages(row.chatId)) as Array<
                Record<string, unknown>
              >;
              for (const m of messages) {
                if (typeof m.id !== 'string' || !set.has(m.id)) continue;
                const text = getMessageDisplayText(
                  m as Parameters<typeof getMessageDisplayText>[0]
                );
                out.push({
                  key: `${row.chatId}:${m.id}`,
                  chatId: row.chatId,
                  chatType: row.chatType,
                  messageId: m.id,
                  preview: text || String(m.file_name || m.message_type || 'Message'),
                });
              }
            } catch {
              /* skip */
            }
          })
        );
        if (alive) {
          setItems(out);
          setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.listBg }]} edges={['left', 'right']}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.headerBg,
            marginTop: -insets.top,
            paddingTop: insets.top + 8,
            borderBottomColor: theme.listBorder,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.headerText} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.headerText }]}>Starred messages</Text>
        <View style={{ width: 24 }} />
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} /> : null}
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          !loading ? (
            <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
              Star messages in any chat to collect them here
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.listBorder }]}
            onPress={() =>
              openChat({
                chatId: item.chatId,
                chatType: item.chatType,
                chatName: 'Chat',
                focusMessageId: item.messageId,
              })
            }
          >
            <Ionicons name="star" size={18} color="#f9a825" style={{ marginRight: 10 }} />
            <Text style={[styles.preview, { color: theme.listPrimaryText }]} numberOfLines={2}>
              {item.preview}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  preview: { flex: 1, fontSize: 15, lineHeight: 20 },
});
