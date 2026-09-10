import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { useHeaderChrome } from '../../context/AppChromeContext';
import { searchMessagesAcrossChats, type GlobalSearchHit } from '../../lib/globalMessageSearch';
import { openChat } from '../../navigation/chatNavigationBridge';

export default function GlobalSearchScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  useHeaderChrome(theme.headerBg);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      setHits(await searchMessagesAcrossChats(q));
    } finally {
      setLoading(false);
    }
  }, []);

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
        <TextInput
          style={[styles.input, { color: theme.headerText, borderColor: theme.listBorder }]}
          placeholder="Search all messages"
          placeholderTextColor={theme.listSecondaryText}
          value={query}
          onChangeText={(t) => void runSearch(t)}
          autoFocus
        />
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} /> : null}
      <FlatList
        data={hits}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
            {query.trim().length >= 2
              ? 'No messages found'
              : 'Type at least 2 characters to search every chat on this device'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.listBorder }]}
            onPress={() =>
              openChat({
                chatId: item.chatId,
                chatType: item.chatType,
                chatName: item.chatName || 'Chat',
                focusMessageId: item.messageId,
              })
            }
          >
            <Text style={[styles.preview, { color: theme.listPrimaryText }]} numberOfLines={2}>
              {item.preview}
            </Text>
            <Text style={[styles.when, { color: theme.listSecondaryText }]}>
              {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
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
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  row: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  preview: { fontSize: 15, lineHeight: 20 },
  when: { fontSize: 12, marginTop: 4 },
});
