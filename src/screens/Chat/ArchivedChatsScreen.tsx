import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { useHeaderChrome } from '../../context/AppChromeContext';
import { useIndividualChats } from '../../hooks/useIndividualChats';
import { useGroupList } from '../../hooks/useGroupList';
import { chatListKey } from '../../lib/chatListHidden';
import { loadChatListMeta, patchChatListMeta, type ChatListMeta } from '../../lib/chatListMeta';
import { openChat } from '../../navigation/chatNavigationBridge';
import { api } from '../../lib/api';

type Row = {
  key: string;
  kind: 'individual' | 'group';
  id: string;
  name: string;
  preview?: string;
};

export default function ArchivedChatsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  useHeaderChrome(theme.headerBg);
  const { chats } = useIndividualChats('');
  const { groups } = useGroupList('');
  const [meta, setMeta] = useState<Record<string, ChatListMeta>>({});

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadChatListMeta().then((m) => {
        if (alive) setMeta(m);
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  const rows = useMemo((): Row[] => {
    const out: Row[] = [];
    for (const c of chats) {
      const key = chatListKey('individual', c.user_id);
      if (!meta[key]?.archived) continue;
      out.push({
        key,
        kind: 'individual',
        id: c.user_id,
        name: c.name,
        preview: c.last_message ?? undefined,
      });
    }
    for (const g of groups) {
      const key = chatListKey('group', g.id);
      if (!meta[key]?.archived) continue;
      out.push({
        key,
        kind: 'group',
        id: g.id,
        name: g.name,
        preview: g.last_message ?? undefined,
      });
    }
    return out;
  }, [chats, groups, meta]);

  const unarchive = async (kind: 'individual' | 'group', id: string) => {
    setMeta(await patchChatListMeta(kind, id, { archived: false }));
    void api.chatSettings.update(kind, id, { is_archived: false }).catch(() => undefined);
  };

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
        <Text style={[styles.title, { color: theme.headerText }]}>Archived</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
            Long-press a chat → Archive to move it here
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.listBorder }]}
            onPress={() =>
              openChat({ chatId: item.id, chatType: item.kind, chatName: item.name })
            }
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.listPrimaryText }]}>{item.name}</Text>
              {item.preview ? (
                <Text style={{ color: theme.listSecondaryText }} numberOfLines={1}>
                  {item.preview}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => void unarchive(item.kind, item.id)}>
              <Text style={{ color: theme.primary, fontWeight: '600' }}>Unarchive</Text>
            </TouchableOpacity>
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
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 16, fontWeight: '600' },
});
