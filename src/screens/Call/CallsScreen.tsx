import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { ApiError, type CallHistoryItemDTO } from '../../lib/api';
import { showAppToast } from '../../lib/appToast';
import { startCallGuarded } from '../../lib/startCallGuarded';
import { useAuth } from '../../hooks/useAuth';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { useAppChrome } from '../../context/AppChromeContext';
import { navigateToChat } from '../../navigation/navigateToChat';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { useCallsFeed } from '../../hooks/useCallsFeed';
import { CallFriendPickerSheet } from '../../components/CallFriendPickerSheet';
import { promptSignIn } from '../../lib/requireSignedIn';

type Tab = 'all' | 'missed';
type CallSection = { title: string; data: CallHistoryItemDTO[] };

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTalkTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function relativeTime(iso: string): string {
  const created = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  if (diffMs < 60_000) return 'Just now';
  const sameDay = created.toDateString() === now.toDateString();
  if (sameDay) {
    return created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (created.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (now.getTime() - created.getTime() < 7 * 24 * 3600_000) {
    return created.toLocaleDateString([], { weekday: 'short' });
  }
  return created.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sectionTitleFor(iso: string): string {
  const created = new Date(iso);
  const now = new Date();
  if (created.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (created.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (now.getTime() - created.getTime() < 7 * 24 * 3600_000) {
    return created.toLocaleDateString([], { weekday: 'long' });
  }
  return created.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function callDisplayName(c: CallHistoryItemDTO): string {
  if (c.scope === 'group') return c.group?.name ?? 'Group call';
  return c.peer?.display_name?.trim() || c.peer?.email?.split('@')[0] || 'Unknown';
}

function isMissedFor(c: CallHistoryItemDTO): boolean {
  if (c.status === 'missed' || c.status === 'declined') return true;
  if (c.direction === 'outgoing' && c.status === 'cancelled') return true;
  return false;
}

function missedLabel(c: CallHistoryItemDTO): string {
  if (c.status === 'declined') return 'Declined';
  if (c.direction === 'outgoing' && (c.status === 'cancelled' || c.status === 'missed')) {
    return 'No answer';
  }
  return 'Missed';
}

function peerUserId(c: CallHistoryItemDTO, myAuthId?: string | null): string | null {
  if (c.scope !== 'direct') return null;
  if (c.direction === 'outgoing' && c.callee_id) return c.callee_id;
  if (c.direction === 'incoming' && c.caller_id) return c.caller_id;
  if (!myAuthId) return null;
  return c.caller_id === myAuthId ? c.callee_id : c.caller_id;
}

function groupCalls(calls: CallHistoryItemDTO[]): CallSection[] {
  const map = new Map<string, CallHistoryItemDTO[]>();
  for (const call of calls) {
    const title = sectionTitleFor(call.created_at);
    if (!map.has(title)) map.set(title, []);
    map.get(title)!.push(call);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

export default function CallsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const { setChrome, resetChrome } = useAppChrome();
  const isFocused = useIsFocused();
  const { user, isGuest, exitGuest } = useAuth();
  const myProfileId = useCurrentProfileId();
  const {
    calls,
    friends: friendContacts,
    callsEnabled,
    loading,
    refreshing,
    error,
    refresh,
  } = useCallsFeed(myProfileId);

  const [tab, setTab] = useState<Tab>('all');
  const myAuthId = user?.id ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);

  const shellBg = theme.listHeaderBg;
  const statusStyle = theme.isDark ? 'light-content' : 'dark-content';

  useEffect(() => {
    if (!isFocused) return;
    setChrome({
      topBg: shellBg,
      statusBarStyle: statusStyle,
      immersive: false,
    });
    return () => resetChrome();
  }, [isFocused, shellBg, statusStyle, setChrome, resetChrome]);

  const requireAuth = useCallback(
    (message?: string) => {
      if (!isGuest) return true;
      promptSignIn({
        title: 'Sign in required',
        message: message ?? 'Sign in to use calls, or continue exploring as a guest.',
        onLogin: exitGuest,
      });
      return false;
    },
    [isGuest, exitGuest]
  );

  const missedCount = useMemo(() => calls.filter(isMissedFor).length, [calls]);

  const filtered = useMemo(
    () => (tab === 'missed' ? calls.filter(isMissedFor) : calls),
    [calls, tab]
  );

  const sections = useMemo(() => groupCalls(filtered), [filtered]);

  const weekStats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    const recent = calls.filter(
      (c) => new Date(c.created_at).getTime() >= weekAgo && !isMissedFor(c)
    );
    const talkSeconds = recent.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);
    return { count: recent.length, talkSeconds };
  }, [calls]);

  const quickFriends = useMemo(() => friendContacts.slice(0, 14), [friendContacts]);

  const startCallToUser = useCallback(
    async (
      userId: string,
      type: 'voice' | 'video',
      peerHint?: { peerName?: string; peerAvatar?: string | null }
    ) => {
      if (!requireAuth('Sign in to place a call.')) return;
      if (callsEnabled === false) {
        showAppToast('Calls are not enabled on this server yet', { isError: true });
        return;
      }
      setPickerOpen(false);
      if (Platform.OS === 'android') {
        await new Promise((r) => setTimeout(r, 80));
      }
      try {
        const { call, live_kit } = await startCallGuarded(
          { type, callee_id: userId },
          peerHint
        );
        const { navigateToOutgoingCall } = await import('../../navigation/rootNavigation');
        navigateToOutgoingCall({ call, token: live_kit.token, url: live_kit.url });
      } catch (err) {
        showAppToast(err instanceof ApiError ? err.message : 'Could not start call', {
          isError: true,
        });
      }
    },
    [callsEnabled, requireAuth]
  );

  const startCall = useCallback(
    async (target: CallHistoryItemDTO, type: 'voice' | 'video') => {
      if (!requireAuth('Sign in to place a call.')) return;
      if (target.scope === 'direct') {
        const otherUserId = peerUserId(target, myAuthId);
        if (!otherUserId) {
          showAppToast('Still loading your account — try again in a moment', {
            isError: true,
          });
          return;
        }
        await startCallToUser(otherUserId, type, {
          peerName: callDisplayName(target),
          peerAvatar: target.peer?.avatar_url ?? null,
        });
        return;
      }
      if (target.scope === 'group' && target.group_id) {
        if (callsEnabled === false) {
          showAppToast('Calls are not enabled on this server yet', { isError: true });
          return;
        }
        try {
          setPickerOpen(false);
          const { call, live_kit } = await startCallGuarded(
            { type, group_id: target.group_id },
            {
              peerName: callDisplayName(target),
              peerAvatar: target.group?.avatar_url ?? null,
            }
          );
          const { navigateToOutgoingCall } = await import('../../navigation/rootNavigation');
          navigateToOutgoingCall({ call, token: live_kit.token, url: live_kit.url });
        } catch (err) {
          showAppToast(err instanceof ApiError ? err.message : 'Could not start call', {
            isError: true,
          });
        }
      }
    },
    [callsEnabled, myAuthId, startCallToUser, requireAuth]
  );

  const openChatFor = useCallback(
    (item: CallHistoryItemDTO) => {
      if (!requireAuth('Sign in to open chats from calls.')) return;
      const uid = peerUserId(item, myAuthId);
      if (!uid || item.scope !== 'direct') return;
      navigateToChat({
        chatType: 'individual',
        chatId: uid,
        chatName: callDisplayName(item),
        avatarUrl: item.peer?.avatar_url ?? undefined,
      });
    },
    [myAuthId, requireAuth]
  );

  const openPicker = useCallback(() => {
    if (!requireAuth('Sign in to call your friends.')) return;
    setPickerOpen(true);
  }, [requireAuth]);

  const renderCallItem = ({ item }: { item: CallHistoryItemDTO }) => {
    const missed = isMissedFor(item);
    const incoming = item.direction === 'incoming';
    const name = callDisplayName(item);
    const avatar =
      item.scope === 'group' ? item.group?.avatar_url ?? null : item.peer?.avatar_url ?? null;
    const kind = missed
      ? missedLabel(item)
      : item.call_type === 'video'
        ? 'Video call'
        : 'Voice call';
    const when = relativeTime(item.created_at);
    const duration = !missed && item.duration_seconds ? formatDuration(item.duration_seconds) : '';
    const canChat = item.scope === 'direct';
    const danger = '#E53935';

    return (
      <View style={styles.row}>
        <Pressable
          style={styles.rowMain}
          onPress={() => canChat && openChatFor(item)}
          disabled={!canChat}
        >
          <View style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <LinearGradient
                colors={[theme.accent, theme.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
            <View
              style={[
                styles.typeDot,
                {
                  backgroundColor: item.call_type === 'video' ? '#22c55e' : theme.primary,
                  borderColor: theme.listBg,
                },
              ]}
            >
              <Ionicons
                name={item.call_type === 'video' ? 'videocam' : 'call'}
                size={9}
                color="#fff"
              />
            </View>
          </View>

          <View style={styles.rowText}>
            <Text
              style={[styles.rowName, { color: missed ? danger : theme.listPrimaryText }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <View style={styles.metaRow}>
              <Ionicons
                name={missed ? 'close-circle' : incoming ? 'arrow-down' : 'arrow-up'}
                size={13}
                color={missed ? danger : theme.listSecondaryText}
              />
              <Text
                style={[styles.metaText, { color: missed ? danger : theme.listSecondaryText }]}
                numberOfLines={1}
              >
                {kind}
                {duration ? ` · ${duration}` : ''}
                {` · ${when}`}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.rowActions}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: theme.isDark ? 'rgba(96,165,250,0.14)' : '#eaf3ff' },
            ]}
            onPress={() => void startCall(item, 'voice')}
            accessibilityLabel="Voice call back"
          >
            <Ionicons name="call" size={18} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: theme.isDark ? 'rgba(34,197,94,0.14)' : '#e9f9ef' },
            ]}
            onPress={() => void startCall(item, 'video')}
            accessibilityLabel="Video call back"
          >
            <Ionicons name="videocam" size={18} color="#16a34a" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View>
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: shellBg,
            marginTop: -insets.top,
            paddingTop: insets.top + 10,
            borderBottomColor: theme.listBorder,
          },
        ]}
      >
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.listHeaderText }]}>Calls</Text>
          <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
            {weekStats.count > 0
              ? `${weekStats.count} calls · ${formatTalkTime(weekStats.talkSeconds)} this week`
              : 'Voice & video with friends'}
          </Text>
        </View>

        {missedCount > 0 ? (
          <Pressable
            style={[
              styles.missedPill,
              {
                backgroundColor: theme.isDark ? 'rgba(229,57,53,0.18)' : '#fee2e2',
              },
            ]}
            onPress={() => setTab('missed')}
          >
            <View style={styles.missedDot} />
            <Text style={styles.missedPillText}>{missedCount} missed</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Soft accent wash under the header */}
      <LinearGradient
        colors={[
          theme.isDark ? `${theme.primary}18` : `${theme.primary}12`,
          theme.listBg,
        ]}
        style={styles.wash}
      >
        {quickFriends.length > 0 ? (
          <View style={styles.quickBlock}>
            <Text style={[styles.quickHeading, { color: theme.sectionLabel }]}>Favorites</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickScroll}
            >
              {quickFriends.map((f) => (
                <Pressable
                  key={f.userId}
                  style={styles.quickItem}
                  onPress={() =>
                    void startCallToUser(f.userId, 'voice', {
                      peerName: f.name,
                      peerAvatar: f.avatar,
                    })
                  }
                  onLongPress={() =>
                    void startCallToUser(f.userId, 'video', {
                      peerName: f.name,
                      peerAvatar: f.avatar,
                    })
                  }
                >
                  <View style={styles.quickAvatarRing}>
                    {f.avatar ? (
                      <Image source={{ uri: f.avatar }} style={styles.quickAvatar} />
                    ) : (
                      <LinearGradient
                        colors={[theme.accent, theme.primary]}
                        style={styles.quickAvatar}
                      >
                        <Text style={styles.quickLetter}>{f.name.charAt(0).toUpperCase()}</Text>
                      </LinearGradient>
                    )}
                    <View
                      style={[
                        styles.quickCallBadge,
                        { backgroundColor: theme.primary, borderColor: theme.listBg },
                      ]}
                    >
                      <Ionicons name="call" size={9} color="#fff" />
                    </View>
                  </View>
                  <Text
                    style={[styles.quickName, { color: theme.listPrimaryText }]}
                    numberOfLines={1}
                  >
                    {f.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={[styles.segmentTrack, { backgroundColor: theme.searchBg }]}>
          {([
            { key: 'all' as Tab, label: 'Recent' },
            { key: 'missed' as Tab, label: 'Missed' },
          ]).map(({ key, label }) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[
                  styles.segmentBtn,
                  active && {
                    backgroundColor: theme.listCardBg,
                    shadowColor: '#000',
                    shadowOpacity: theme.isDark ? 0 : 0.08,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: theme.isDark ? 0 : 2,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    {
                      color: active ? theme.listPrimaryText : theme.listSecondaryText,
                      fontWeight: active ? '800' : '600',
                    },
                  ]}
                >
                  {label}
                </Text>
                {key === 'missed' && missedCount > 0 ? (
                  <View style={styles.segmentBadge}>
                    <Text style={styles.segmentBadgeText}>
                      {missedCount > 9 ? '9+' : missedCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      {callsEnabled === false ? (
        <View
          style={[
            styles.warn,
            {
              backgroundColor: theme.isDark ? '#2a2110' : '#fff8e8',
              borderColor: theme.isDark ? '#5c4a1a' : '#f5d78e',
            },
          ]}
        >
          <Ionicons name="warning-outline" size={15} color="#d97706" />
          <Text style={[styles.warnText, { color: theme.isDark ? '#fbbf24' : '#92400e' }]}>
            Calls are disabled on this server.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.listBg }]}
      edges={['left', 'right']}
    >
      {loading && calls.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={[styles.loadingText, { color: theme.listSecondaryText }]}>
            Loading calls…
          </Text>
        </View>
      ) : error && calls.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={theme.listSecondaryText} />
          <Text style={[styles.errorText, { color: theme.listSecondaryText }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.primary }]}
            onPress={refresh}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          renderItem={renderCallItem}
          renderSectionHeader={({ section: { title } }) => (
            <Text
              style={[
                styles.section,
                { color: theme.sectionLabel, backgroundColor: theme.listBg },
              ]}
            >
              {title}
            </Text>
          )}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: theme.listBorder }]} />
          )}
          ListHeaderComponent={listHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <LinearGradient
                colors={[`${theme.primary}28`, `${theme.accent}14`]}
                style={styles.emptyOrb}
              >
                <Ionicons
                  name={tab === 'missed' ? 'checkmark-done' : 'call-outline'}
                  size={34}
                  color={tab === 'missed' ? '#22c55e' : theme.primary}
                />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: theme.listPrimaryText }]}>
                {tab === 'missed' ? 'All caught up' : 'No recent calls'}
              </Text>
              <Text style={[styles.emptySub, { color: theme.listSecondaryText }]}>
                {tab === 'missed'
                  ? 'No missed calls right now.'
                  : 'Tap the button below to call a friend.'}
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[
          styles.fab,
          {
            bottom: insets.bottom + 20,
            backgroundColor: theme.primary,
            shadowColor: theme.primary,
          },
        ]}
        onPress={openPicker}
        activeOpacity={0.9}
        accessibilityLabel="Call a friend"
      >
        <Ionicons name="people" size={24} color="#fff" />
      </TouchableOpacity>

      <CallFriendPickerSheet
        visible={pickerOpen}
        friends={friendContacts}
        onClose={() => setPickerOpen(false)}
        onCall={(userId, type, peerHint) => void startCallToUser(userId, type, peerHint)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 15 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  titleBlock: { flex: 1 },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 3,
  },
  missedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 2,
  },
  missedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E53935',
  },
  missedPillText: {
    color: '#E53935',
    fontSize: 12,
    fontWeight: '800',
  },
  wash: {
    paddingBottom: 4,
  },
  quickBlock: {
    paddingTop: 14,
  },
  quickHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  quickScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  quickItem: {
    width: 72,
    alignItems: 'center',
  },
  quickAvatarRing: {
    position: 'relative',
  },
  quickAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLetter: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  quickCallBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  quickName: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  segmentTrack: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    padding: 4,
    borderRadius: 14,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
    gap: 6,
  },
  segmentLabel: { fontSize: 14 },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warnText: { flex: 1, fontSize: 12, fontWeight: '600' },
  section: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  listContent: { paddingBottom: 110, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingRight: 8,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 18, fontWeight: '800' },
  typeDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  rowText: { flex: 1, marginLeft: 14, minWidth: 0 },
  rowName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  metaText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  rowActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 80,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 36,
  },
  emptyOrb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  errorText: { textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
