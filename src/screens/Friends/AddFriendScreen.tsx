import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { useFriendshipsRealtime } from '../../hooks/useFriendshipsRealtime';
import { notifyFriendshipsListenersImmediate } from '../../lib/friendshipsRealtime';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { useAppChrome } from '../../context/AppChromeContext';
import { showAppToast } from '../../lib/appToast';
import {
  getAddFriendPrefetchCache,
  prefetchAddFriend,
  upsertAddFriendFriendships,
  type AddFriendFriendship,
  type AddFriendProfile,
  type SuggestionSection,
  type SuggestionType,
} from '../../lib/addFriendPrefetch';

const SECTION_META: Record<
  SuggestionType,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  mutual_friends: { icon: 'people', color: '#0ea5e9' },
  location: { icon: 'location', color: '#22c55e' },
  new_users: { icon: 'sparkles', color: '#f59e0b' },
};

function ProfileAvatar({
  uri,
  name,
  primary,
}: {
  uri?: string;
  name: string;
  primary: string;
}) {
  const [error, setError] = useState(false);
  const letter = (name || '?').charAt(0).toUpperCase();

  if (!uri || error) {
    return (
      <View style={[styles.avatar, { backgroundColor: primary }]}>
        <Text style={styles.avatarLetter}>{letter}</Text>
      </View>
    );
  }

  return <Image source={{ uri }} style={styles.avatar} onError={() => setError(true)} />;
}

export default function AddFriendsListScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { theme } = useChatSettings();
  const { setChrome, resetChrome } = useAppChrome();
  const currentProfileId = useCurrentProfileId();
  const [searchFocused, setSearchFocused] = useState(false);

  const cached = getAddFriendPrefetchCache({ allowStale: true });
  const [suggestions, setSuggestions] = useState<SuggestionSection[]>(
    () => cached?.suggestions ?? []
  );
  const [friendships, setFriendships] = useState<AddFriendFriendship[]>(
    () => cached?.friendships ?? []
  );
  const [profiles, setProfiles] = useState<AddFriendProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(
    () => !(cached?.suggestions && cached.suggestions.length > 0)
  );
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isFocused) return;
    setChrome({
      topBg: theme.listHeaderBg,
      statusBarStyle: theme.isDark ? 'light-content' : 'dark-content',
      immersive: false,
    });
    return () => resetChrome();
  }, [isFocused, theme.listHeaderBg, theme.isDark, setChrome, resetChrome]);

  const loadFriendships = useCallback(async () => {
    if (!currentProfileId) return;
    try {
      const { friendships: data } = await api.friendships.list();
      const rows = (data as AddFriendFriendship[]) || [];
      setFriendships(rows);
      upsertAddFriendFriendships(rows);
    } catch {
      /* ignore */
    }
  }, [currentProfileId]);

  const refreshSuggestions = useCallback(async () => {
    if (!currentProfileId || !user?.id) return;
    const hadCache = (getAddFriendPrefetchCache({ allowStale: true })?.suggestions.length ?? 0) > 0;
    if (!hadCache) setLoadingSuggestions(true);
    try {
      const next = await prefetchAddFriend();
      if (next) {
        setSuggestions(next.suggestions);
        setFriendships(next.friendships);
      }
    } catch {
      /* keep cache */
    } finally {
      setLoadingSuggestions(false);
    }
  }, [currentProfileId, user?.id]);

  useEffect(() => {
    void refreshSuggestions();
  }, [refreshSuggestions]);

  useFriendshipsRealtime(currentProfileId, () => {
    void loadFriendships();
    void refreshSuggestions();
  });

  useEffect(() => {
    if (!searchQuery.trim() || !user?.id) {
      setProfiles([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const { profiles: data } = await api.profiles.search(searchQuery);
        setProfiles((data as AddFriendProfile[]) || []);
      } catch {
        showAppToast('Failed to search users', { isError: true });
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, user?.id]);

  const getFriendshipStatus = (targetProfileId: string): AddFriendFriendship['status'] | null => {
    const found = friendships.find(
      (f) =>
        (f.user_id === currentProfileId && f.friend_id === targetProfileId) ||
        (f.friend_id === currentProfileId && f.user_id === targetProfileId)
    );
    return found ? found.status : null;
  };

  const handleAddFriend = async (targetProfileId: string) => {
    if (!currentProfileId) {
      showAppToast('Profile not loaded yet', { isError: true });
      return;
    }
    if (targetProfileId === currentProfileId) {
      showAppToast("You can't add yourself", { isError: true });
      return;
    }
    const status = getFriendshipStatus(targetProfileId);
    if (status === 'pending') {
      showAppToast('Request already pending');
      return;
    }
    if (status === 'accepted') {
      showAppToast('You are already friends');
      return;
    }

    setSendingId(targetProfileId);
    try {
      const { friendship: data } = await api.friendships.request(targetProfileId);
      setFriendships((prev) => {
        const next = [...prev, data as AddFriendFriendship];
        upsertAddFriendFriendships(next);
        return next;
      });
      notifyFriendshipsListenersImmediate();
      showAppToast('Friend request sent');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send request';
      showAppToast(message, { isError: true });
    } finally {
      setSendingId(null);
    }
  };

  const renderAction = (profileId: string) => {
    const status = getFriendshipStatus(profileId);

    if (status === 'accepted') {
      return (
        <View
          style={[
            styles.statusPill,
            { backgroundColor: theme.isDark ? 'rgba(34,197,94,0.16)' : '#e8f5e9' },
          ]}
        >
          <Ionicons name="checkmark-circle" size={14} color="#2e7d32" />
          <Text style={styles.friendsPillText}>Friends</Text>
        </View>
      );
    }

    if (status === 'pending') {
      return (
        <View
          style={[
            styles.statusPill,
            { backgroundColor: theme.isDark ? 'rgba(245,158,11,0.16)' : '#fff3e0' },
          ]}
        >
          <Ionicons name="time-outline" size={14} color="#e65100" />
          <Text style={styles.pendingPillText}>Pending</Text>
        </View>
      );
    }

    const busy = sendingId === profileId;
    return (
      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: theme.primary }]}
        onPress={() => void handleAddFriend(profileId)}
        activeOpacity={0.85}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="person-add" size={15} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  const renderUser = (item: AddFriendProfile) => {
    const displayName = item.display_name?.trim() || item.email?.split('@')[0] || 'User';

    return (
      <View style={styles.row}>
        <ProfileAvatar uri={item.avatar_url} name={displayName} primary={theme.primary} />
        <View style={styles.rowText}>
          <Text style={[styles.userName, { color: theme.listPrimaryText }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.userEmail, { color: theme.listSecondaryText }]} numberOfLines={1}>
            {item.email}
          </Text>
          {item.reason ? (
            <Text style={[styles.reasonText, { color: theme.primary }]} numberOfLines={1}>
              {item.reason}
            </Text>
          ) : null}
          {item.mutual_friends_count && item.mutual_friends_count > 0 ? (
            <Text style={styles.mutualText}>
              {item.mutual_friends_count} mutual friend
              {item.mutual_friends_count !== 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
        {renderAction(item.id)}
      </View>
    );
  };

  const isSearching = searchQuery.trim().length > 0;

  const listData = useMemo(() => {
    if (isSearching) {
      return profiles.map((p) => ({ kind: 'user' as const, key: `s-${p.id}`, profile: p }));
    }
    const rows: Array<
      | { kind: 'header'; key: string; title: string; type: SuggestionType; count: number }
      | { kind: 'user'; key: string; profile: AddFriendProfile }
    > = [];
    for (const section of suggestions) {
      rows.push({
        kind: 'header',
        key: `h-${section.type}`,
        title: section.title,
        type: section.type,
        count: section.data.length,
      });
      for (const p of section.data) {
        rows.push({ kind: 'user', key: `${section.type}-${p.id}`, profile: p });
      }
    }
    return rows;
  }, [isSearching, profiles, suggestions]);

  const searchActive = searchFocused || searchQuery.length > 0;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.listBg }]}
      edges={['left', 'right', 'bottom']}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.listHeaderBg,
            marginTop: -insets.top,
            paddingTop: insets.top + 8,
            borderBottomColor: theme.listBorder,
          },
        ]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: theme.searchBg }]}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color={theme.listHeaderText} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: theme.listHeaderText }]}>Add friends</Text>
            <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
              Search people or pick a suggestion
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.searchShell,
            {
              backgroundColor: theme.isDark ? theme.listCardBg : '#fff',
              borderColor: searchActive ? theme.primary : 'transparent',
              shadowOpacity: theme.isDark ? 0 : searchActive ? 0.12 : 0.06,
              elevation: theme.isDark ? 0 : searchActive ? 4 : 2,
            },
          ]}
        >
          <View
            style={[
              styles.searchIconCap,
              {
                backgroundColor: searchActive
                  ? theme.isDark
                    ? `${theme.primary}33`
                    : `${theme.primary}18`
                  : theme.searchBg,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={16}
              color={searchActive ? theme.primary : theme.searchPlaceholder}
            />
          </View>
          <TextInput
            style={[styles.searchInput, { color: theme.searchText }]}
            placeholder="Name, email, or @handle"
            placeholderTextColor={theme.searchPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
          />
          {loading && isSearching ? (
            <ActivityIndicator size="small" color={theme.primary} style={styles.searchSpinner} />
          ) : null}
          {searchQuery.length > 0 ? (
            <Pressable
              style={[styles.clearChip, { backgroundColor: theme.searchBg }]}
              onPress={() => setSearchQuery('')}
              hitSlop={6}
            >
              <Ionicons name="close" size={14} color={theme.listSecondaryText} />
            </Pressable>
          ) : (
            <Text style={[styles.searchHint, { color: theme.searchPlaceholder }]}>Find</Text>
          )}
        </View>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            const meta = SECTION_META[item.type];
            return (
              <View style={styles.sectionHead}>
                <View style={[styles.sectionIcon, { backgroundColor: `${meta.color}22` }]}>
                  <Ionicons name={meta.icon} size={15} color={meta.color} />
                </View>
                <Text style={[styles.sectionTitle, { color: theme.listPrimaryText }]}>
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.sectionCount,
                    { color: theme.listSecondaryText, backgroundColor: theme.searchBg },
                  ]}
                >
                  {item.count}
                </Text>
              </View>
            );
          }
          return renderUser(item.profile);
        }}
        ItemSeparatorComponent={() =>
          !isSearching ? (
            <View style={[styles.separator, { backgroundColor: theme.listBorder }]} />
          ) : null
        }
        ListHeaderComponent={
          <Text style={[styles.resultsLabel, { color: theme.sectionLabel }]}>
            {isSearching
              ? loading
                ? 'Searching…'
                : `${profiles.length} result${profiles.length === 1 ? '' : 's'}`
              : 'Suggested for you'}
          </Text>
        }
        ListEmptyComponent={
          isSearching && !loading ? (
            <View style={styles.emptyBox}>
              <View style={[styles.emptyOrb, { backgroundColor: theme.searchBg }]}>
                <Ionicons name="search-outline" size={32} color={theme.listSecondaryText} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.listPrimaryText }]}>No users found</Text>
              <Text style={[styles.emptySub, { color: theme.listSecondaryText }]}>
                Try a different name or email
              </Text>
            </View>
          ) : !isSearching && loadingSuggestions ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.emptySub, { color: theme.listSecondaryText }]}>
                Loading suggestions…
              </Text>
            </View>
          ) : !isSearching ? (
            <View style={styles.emptyBox}>
              <LinearGradient
                colors={[`${theme.primary}28`, `${theme.accent}14`]}
                style={styles.emptyOrb}
              >
                <Ionicons name="people-outline" size={32} color={theme.primary} />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: theme.listPrimaryText }]}>
                No suggestions yet
              </Text>
              <Text style={[styles.emptySub, { color: theme.listSecondaryText }]}>
                Search above to find friends by name or email
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
    width: Platform.OS === 'web' ? 420 : '100%',
    maxWidth: '100%',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 6,
    shadowColor: '#0f172a',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  searchIconCap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
    paddingVertical: Platform.OS === 'android' ? 8 : 6,
  },
  searchSpinner: { marginRight: 2 },
  clearChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchHint: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  listContent: {
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  resultsLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  rowText: { flex: 1, minWidth: 0 },
  userName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  userEmail: { fontSize: 13, marginTop: 2 },
  reasonText: { fontSize: 12, marginTop: 3, fontWeight: '600' },
  mutualText: {
    fontSize: 12,
    color: '#2e7d32',
    marginTop: 3,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 72,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
  },
  friendsPillText: { color: '#2e7d32', fontSize: 12, fontWeight: '700' },
  pendingPillText: { color: '#e65100', fontSize: 12, fontWeight: '700' },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
