import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FAB } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type CallHistoryItemDTO } from '../../lib/api';
import { showAppToast } from '../../lib/appToast';
import { startCallGuarded } from '../../lib/startCallGuarded';
import { useAuth } from '../../hooks/useAuth';
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
  // Prefer direction from history (server already labeled it) so callback
  // works even before local auth id has resolved.
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
    const recent = calls.filter((c) => new Date(c.created_at).getTime() >= weekAgo && !isMissedFor(c));
    const talkSeconds = recent.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);
    return { count: recent.length, talkSeconds };
  }, [calls]);

  const startCallToUser = useCallback(
    async (userId: string, type: 'voice' | 'video') => {
      if (!requireAuth('Sign in to place a call.')) return;
      if (callsEnabled === false) {
        showAppToast('Calls are not enabled on this server yet', { isError: true });
        return;
      }
      try {
        const { call, live_kit } = await startCallGuarded({ type, callee_id: userId });
        setPickerOpen(false);
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
        await startCallToUser(otherUserId, type);
        return;
      }
      if (target.scope === 'group' && target.group_id) {
        if (callsEnabled === false) {
          showAppToast('Calls are not enabled on this server yet', { isError: true });
          return;
        }
        try {
          const { call, live_kit } = await startCallGuarded({ type, group_id: target.group_id });
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

  const renderCallItem = (item: CallHistoryItemDTO) => {
    const missed = isMissedFor(item);
    const incoming = item.direction === 'incoming';
    const name = callDisplayName(item);
    const avatar =
      item.scope === 'group' ? item.group?.avatar_url ?? null : item.peer?.avatar_url ?? null;
    const sub = missed
      ? missedLabel(item)
      : item.duration_seconds
        ? `${relativeTime(item.created_at)} · ${formatDuration(item.duration_seconds)}`
        : relativeTime(item.created_at);
    const canChat = item.scope === 'direct';

    return (
      <View style={styles.callItem}>
        <TouchableOpacity
          style={styles.callMain}
          activeOpacity={0.7}
          onPress={() => canChat && openChatFor(item)}
          disabled={!canChat}
        >
          <View style={styles.avatarContainer}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View
              style={[
                styles.callTypeIcon,
                item.call_type === 'video' ? styles.videoIcon : styles.voiceIcon,
              ]}
            >
              <Ionicons
                name={item.call_type === 'video' ? 'videocam' : 'call'}
                size={12}
                color="#fff"
              />
            </View>
          </View>

          <View style={styles.callInfo}>
            <Text style={[styles.callName, missed && styles.missedCallName]} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.callMeta}>
              <Ionicons
                name={incoming ? 'arrow-down' : 'arrow-up'}
                size={14}
                color={missed ? '#ff3b30' : '#8e8e93'}
              />
              <Text style={[styles.callTime, missed && styles.missedCallTime]}>{sub}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.callbackRow}>
          <TouchableOpacity
            style={[styles.callbackButton, styles.callbackVoice]}
            accessibilityLabel="Call back"
            onPress={() => void startCall(item, 'voice')}
          >
            <Ionicons name="call" size={20} color="#1976d2" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.callbackButton, styles.callbackVideo]}
            accessibilityLabel="Video call back"
            onPress={() => void startCall(item, 'video')}
          >
            <Ionicons name="videocam" size={20} color="#34c759" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View>
      <LinearGradient
        colors={['#0d47a1', '#1976d2', '#42a5f5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 12 }]}
      >
        <Text style={styles.heroTitle}>Calls</Text>
        <Text style={styles.heroSubtitle}>Stay connected with voice & video</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{weekStats.count}</Text>
            <Text style={styles.statLabel}>This week</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatTalkTime(weekStats.talkSeconds)}</Text>
            <Text style={styles.statLabel}>Talk time</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={[styles.statValue, missedCount > 0 && styles.statValueMissed]}>
              {missedCount}
            </Text>
            <Text style={styles.statLabel}>Missed</Text>
          </View>
        </View>
      </LinearGradient>

      {tab === 'all' && missedCount > 0 && (
        <TouchableOpacity style={styles.missedBanner} onPress={() => setTab('missed')}>
          <View style={styles.missedBannerIcon}>
            <Ionicons name="call-outline" size={18} color="#fff" />
          </View>
          <View style={styles.missedBannerText}>
            <Text style={styles.missedBannerTitle}>
              {missedCount} missed call{missedCount === 1 ? '' : 's'}
            </Text>
            <Text style={styles.missedBannerSub}>Tap to view and call back</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#ff3b30" />
        </TouchableOpacity>
      )}

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, tab === 'all' && styles.activeTab]}
          onPress={() => setTab('all')}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={tab === 'all' ? '#fff' : '#8e8e93'}
            style={styles.tabIcon}
          />
          <Text style={[styles.tabText, tab === 'all' && styles.activeTabText]}>Recent</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'missed' && styles.activeTab]}
          onPress={() => setTab('missed')}
        >
          <Ionicons
            name="call-outline"
            size={16}
            color={tab === 'missed' ? '#fff' : '#8e8e93'}
            style={styles.tabIcon}
          />
          <Text style={[styles.tabText, tab === 'missed' && styles.activeTabText]}>Missed</Text>
          {missedCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{missedCount > 9 ? '9+' : missedCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {callsEnabled === false && (
        <View style={styles.disabledBanner}>
          <Ionicons name="alert-circle" size={16} color="#bf6500" />
          <Text style={styles.disabledText}>
            Calls are disabled on this server. Set LIVEKIT_API_KEY in backend .env to enable.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0d47a1" />

      {loading && calls.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#1976d2" size="large" />
          <Text style={styles.loadingText}>Loading calls…</Text>
        </View>
      ) : error && calls.length === 0 ? (
        <View style={styles.loadingBox}>
          <Ionicons name="cloud-offline-outline" size={40} color="#888" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => renderCallItem(item)}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeader}>{title}</Text>
          )}
          ListHeaderComponent={listHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1976d2" />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconRing}>
                <Ionicons
                  name={tab === 'missed' ? 'checkmark-circle' : 'call-outline'}
                  size={40}
                  color={tab === 'missed' ? '#34c759' : '#1976d2'}
                />
              </View>
              <Text style={styles.emptyText}>
                {tab === 'missed' ? 'All caught up!' : 'No recent calls'}
              </Text>
              <Text style={styles.emptySubtext}>
                {tab === 'missed'
                  ? 'You have no missed calls right now.'
                  : 'Tap the friends button below to start a call.'}
              </Text>
            </View>
          }
        />
      )}

      <FAB
        icon="account-multiple"
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => {
          if (!requireAuth('Sign in to call your friends.')) return;
          setPickerOpen(true);
        }}
        color="#fff"
      />

      <CallFriendPickerSheet
        visible={pickerOpen}
        friends={friendContacts}
        onClose={() => setPickerOpen(false)}
        onCall={(userId, type) => void startCallToUser(userId, type)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 15 },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#fff' },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statCard: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statValueMissed: { color: '#ffcdd2' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 4 },
  missedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fff5f5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ffcdd2',
    gap: 10,
  },
  missedBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missedBannerTitle: { fontSize: 14, fontWeight: '700', color: '#c62828' },
  missedBannerText: { flex: 1 },
  missedBannerSub: { fontSize: 12, color: '#e57373', marginTop: 1 },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  activeTab: { backgroundColor: '#1976d2' },
  tabIcon: { marginRight: 6 },
  tabText: { fontSize: 15, fontWeight: '700', color: '#8e8e93' },
  activeTabText: { color: '#fff' },
  badge: {
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  disabledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff5e0',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  disabledText: { color: '#7a4a00', fontSize: 12, flex: 1 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#f4f6f9',
  },
  listContent: { paddingBottom: 100 },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginHorizontal: 12,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  callMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
  },
  avatarContainer: { position: 'relative' },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarFallback: {
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  callTypeIcon: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  videoIcon: { backgroundColor: '#34c759' },
  voiceIcon: { backgroundColor: '#1976d2' },
  callInfo: { flex: 1, marginLeft: 14 },
  callName: { fontSize: 17, fontWeight: '600', color: '#000' },
  missedCallName: { color: '#ff3b30' },
  callMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  callTime: { fontSize: 13, color: '#8e8e93', marginLeft: 4 },
  missedCallTime: { color: '#ff3b30' },
  callbackRow: { flexDirection: 'row', gap: 4 },
  callbackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callbackVoice: { backgroundColor: '#e3f2fd' },
  callbackVideo: { backgroundColor: '#e8f5e9' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  errorText: { color: '#666', textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: '#1976d2',
    borderRadius: 18,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#1976d2',
  },
});
