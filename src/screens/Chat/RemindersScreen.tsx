import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { api } from '../../lib/api';
import { showAppToast } from '../../lib/appToast';
import {
  formatReminderWhen,
  reminderUrgency,
  urgencyColor,
  type ChatReminder,
} from '../../lib/chatReminders';
import { refreshChatReminders } from '../../hooks/useChatReminders';
import { openChat } from '../../navigation/chatNavigationBridge';

function sectionFor(remindAt: string, now = Date.now()): 'due' | 'today' | 'later' {
  const t = new Date(remindAt).getTime();
  if (Number.isNaN(t) || t <= now) return 'due';
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  if (t <= endToday.getTime()) return 'today';
  return 'later';
}

export default function RemindersScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const [items, setItems] = useState<ChatReminder[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await refreshChatReminders();
      setItems(next);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const sections = useMemo(() => {
    const due: ChatReminder[] = [];
    const today: ChatReminder[] = [];
    const later: ChatReminder[] = [];
    for (const r of items) {
      const s = sectionFor(r.remind_at);
      if (s === 'due') due.push(r);
      else if (s === 'today') today.push(r);
      else later.push(r);
    }
    const rows: Array<{ key: string; kind: 'header' | 'row'; title?: string; item?: ChatReminder }> =
      [];
    const push = (title: string, list: ChatReminder[]) => {
      if (!list.length) return;
      rows.push({ key: `h-${title}`, kind: 'header', title });
      for (const item of list) rows.push({ key: item.id, kind: 'row', item });
    };
    push('Due now', due);
    push('Later today', today);
    push('Upcoming', later);
    return rows;
  }, [items]);

  const openReminder = (item: ChatReminder) => {
    openChat({
      chatId: item.chat_id,
      chatType: item.chat_type,
      chatName: item.chat_name || 'Chat',
      focusMessageId: item.message_id || undefined,
    });
  };

  const markDone = async (item: ChatReminder) => {
    try {
      await api.chatReminders.update(item.id, { status: 'done' });
      await reload();
      showAppToast('Marked done');
    } catch {
      showAppToast('Could not update reminder', { isError: true });
    }
  };

  const snooze = async (item: ChatReminder, minutes: number) => {
    try {
      await api.chatReminders.update(item.id, { snooze_minutes: minutes });
      await reload();
      showAppToast(`Snoozed ${minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}`);
    } catch {
      showAppToast('Could not snooze', { isError: true });
    }
  };

  const confirmActions = (item: ChatReminder) => {
    Alert.alert(item.chat_name || 'Reminder', item.preview_text || 'Reminder', [
      { text: 'Open chat', onPress: () => openReminder(item) },
      { text: 'Snooze 1h', onPress: () => void snooze(item, 60) },
      { text: 'Tomorrow', onPress: () => void snooze(item, 24 * 60) },
      { text: 'Done', onPress: () => void markDone(item) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.listBg }]} edges={['left', 'right']}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.headerBg,
            paddingTop: insets.top + 8,
            borderBottomColor: theme.listBorder,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.listPrimaryText} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.listPrimaryText }]}>Reminders</Text>
        <View style={styles.backBtn} />
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(row) => row.key}
          contentContainerStyle={
            sections.length === 0 ? styles.emptyGrow : { paddingBottom: 32 }
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={40} color={theme.listSecondaryText} />
              <Text style={[styles.emptyTitle, { color: theme.listPrimaryText }]}>
                No reminders
              </Text>
              <Text style={[styles.emptySub, { color: theme.listSecondaryText }]}>
                Long-press a message and tap Remind me to park it for later.
              </Text>
            </View>
          }
          renderItem={({ item: row }) => {
            if (row.kind === 'header') {
              return (
                <Text style={[styles.section, { color: theme.listSecondaryText }]}>
                  {row.title}
                </Text>
              );
            }
            const item = row.item!;
            const urgency = reminderUrgency(item.remind_at);
            const color = urgencyColor(urgency, theme.isDark);
            return (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: theme.listBorder }]}
                onPress={() => openReminder(item)}
                onLongPress={() => confirmActions(item)}
                delayLongPress={280}
              >
                <View style={[styles.dot, { backgroundColor: color }]} />
                <View style={styles.rowBody}>
                  <Text style={[styles.chatName, { color: theme.listPrimaryText }]} numberOfLines={1}>
                    {item.chat_name || 'Chat'}
                  </Text>
                  <Text style={[styles.preview, { color: theme.listSecondaryText }]} numberOfLines={2}>
                    {item.preview_text || 'Reminder'}
                    {item.note ? `\n📝 ${item.note}` : ''}
                  </Text>
                  <Text style={[styles.when, { color }]}>{formatReminderWhen(item.remind_at)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => void markDone(item)}
                  hitSlop={10}
                  style={styles.doneBtn}
                >
                  <Ionicons name="checkmark-circle-outline" size={24} color={theme.listSecondaryText} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  emptyGrow: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  rowBody: { flex: 1 },
  chatName: { fontSize: 15, fontWeight: '600' },
  preview: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  when: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  doneBtn: { paddingTop: 2 },
});
