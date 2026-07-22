import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Image,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { useFriendshipsRealtime } from '../../hooks/useFriendshipsRealtime';
import { notifyFriendshipsListenersImmediate } from '../../lib/friendshipsRealtime';

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  region?: string;
  country?: string;
  mutual_friends_count?: number;
  reason?: string;
}

interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
}

type SuggestionType = 'mutual_friends' | 'location' | 'new_users';

const C = {
  primary: '#007AFF',
  primaryDark: '#1e73ce',
  primarySoft: '#e8f2ff',
  bg: '#f4f8fc',
  surface: '#ffffff',
  border: '#e2eaf3',
  text: '#1c1c1e',
  muted: '#6b7280',
};

const SECTION_META: Record<SuggestionType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  mutual_friends: { icon: 'people', color: '#007AFF' },
  location: { icon: 'location', color: '#34c759' },
  new_users: { icon: 'sparkles', color: '#af52de' },
};

function ProfileAvatar({ uri, name }: { uri?: string; name: string }) {
  const [error, setError] = useState(false);
  const letter = (name || '?').charAt(0).toUpperCase();

  if (!uri || error) {
    return (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarLetter}>{letter}</Text>
      </View>
    );
  }

  return <Image source={{ uri }} style={styles.avatar} onError={() => setError(true)} />;
}

export default function AddFriendsListScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [suggestions, setSuggestions] = useState<
    { type: SuggestionType; data: Profile[]; title: string }[]
  >([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const currentProfileId = useCurrentProfileId();
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  const loadFriendships = useCallback(async () => {
    if (!currentProfileId) return;
    try {
      const { friendships: data } = await api.friendships.list();
      setFriendships((data as Friendship[]) || []);
    } catch {
      /* ignore */
    }
  }, [currentProfileId]);

  const refreshSuggestions = useCallback(async () => {
    if (!currentProfileId || !user?.id) return;
    setLoadingSuggestions(true);
    try {
      const { mutual, location, new_users } = await api.profiles.suggestions();
      const allSuggestions = [
        {
          type: 'mutual_friends' as SuggestionType,
          data: mutual as Profile[],
          title: 'People you may know',
        },
        { type: 'location' as SuggestionType, data: location as Profile[], title: 'Near you' },
        {
          type: 'new_users' as SuggestionType,
          data: new_users as Profile[],
          title: 'New on ChatReel',
        },
      ].filter((section) => section.data.length > 0);
      setSuggestions(allSuggestions);
    } catch (error) {
      console.error('Suggestions error:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [currentProfileId, user?.id]);

  useEffect(() => {
    void loadFriendships();
  }, [loadFriendships]);

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
        setProfiles((data as Profile[]) || []);
      } catch (err) {
        console.error('Search error:', err);
        Alert.alert('Error', 'Failed to search users');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, user?.id]);

  const openSearch = useCallback(() => {
    setSearchExpanded(true);
    Animated.timing(searchAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      searchInputRef.current?.focus();
    });
  }, [searchAnim]);

  const closeSearch = useCallback(() => {
    searchInputRef.current?.blur();
    Animated.timing(searchAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setSearchExpanded(false);
        setSearchQuery('');
        setProfiles([]);
      }
    });
  }, [searchAnim]);

  const getFriendshipStatus = (targetProfileId: string): Friendship['status'] | null => {
    const found = friendships.find(
      (f) =>
        (f.user_id === currentProfileId && f.friend_id === targetProfileId) ||
        (f.friend_id === currentProfileId && f.user_id === targetProfileId)
    );
    return found ? found.status : null;
  };

  const handleAddFriend = async (targetProfileId: string) => {
    if (!currentProfileId) {
      Alert.alert('Error', 'Profile not loaded yet.');
      return;
    }

    if (targetProfileId === currentProfileId) {
      Alert.alert('Error', "You can't add yourself!");
      return;
    }

    const status = getFriendshipStatus(targetProfileId);
    if (status === 'pending') {
      Alert.alert('Info', 'Request already pending.');
      return;
    }
    if (status === 'accepted') {
      Alert.alert('Info', 'You are already friends.');
      return;
    }

    try {
      const { friendship: data } = await api.friendships.request(targetProfileId);
      setFriendships((prev) => [...prev, data as Friendship]);
      notifyFriendshipsListenersImmediate();
      Alert.alert('Success', 'Friend request sent!');
    } catch (err: unknown) {
      console.error('Add friend error:', err);
      const message = err instanceof Error ? err.message : 'Failed to send request';
      Alert.alert('Error', message);
    }
  };

  const renderAction = (profileId: string) => {
    const status = getFriendshipStatus(profileId);

    if (status === 'accepted') {
      return (
        <View style={[styles.statusPill, styles.friendsPill]}>
          <Ionicons name="checkmark-circle" size={14} color="#2e7d32" />
          <Text style={styles.friendsPillText}>Friends</Text>
        </View>
      );
    }

    if (status === 'pending') {
      return (
        <View style={[styles.statusPill, styles.pendingPill]}>
          <Ionicons name="time-outline" size={14} color="#e65100" />
          <Text style={styles.pendingPillText}>Pending</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => void handleAddFriend(profileId)}
        activeOpacity={0.85}
      >
        <Ionicons name="person-add" size={16} color="#fff" />
        <Text style={styles.addBtnText}>Add</Text>
      </TouchableOpacity>
    );
  };

  const renderUser = ({ item }: { item: Profile }) => {
    const displayName = item.display_name?.trim() || item.email?.split('@')[0] || 'User';

    return (
      <View style={styles.userCard}>
        <ProfileAvatar uri={item.avatar_url} name={displayName} />
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.userEmail} numberOfLines={1}>
            {item.email}
          </Text>
          {item.reason ? (
            <Text style={styles.reasonText} numberOfLines={1}>
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

  const renderSuggestionSection = ({
    item,
  }: {
    item: { type: SuggestionType; data: Profile[]; title: string };
  }) => {
    const meta = SECTION_META[item.type];
    return (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={[styles.sectionIcon, { backgroundColor: `${meta.color}18` }]}>
            <Ionicons name={meta.icon} size={16} color={meta.color} />
          </View>
          <Text style={styles.sectionTitle}>{item.title}</Text>
          <Text style={styles.sectionCount}>{item.data.length}</Text>
        </View>
        {item.data.map((profile) => (
          <React.Fragment key={`${item.type}-${profile.id}`}>
            {renderUser({ item: profile })}
          </React.Fragment>
        ))}
      </View>
    );
  };

  const isSearching = searchQuery.trim().length > 0;
  const showResults = searchExpanded || isSearching;

  const listHeader = (
    <View style={styles.listHeader}>
      {showResults ? (
        <Text style={styles.resultsLabel}>
          {loading ? 'Searching…' : `${profiles.length} result${profiles.length === 1 ? '' : 's'}`}
        </Text>
      ) : (
        <Text style={styles.resultsLabel}>Suggested for you</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <LinearGradient
        colors={['#0d47a1', '#1976d2', '#42a5f5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { marginTop: -insets.top, paddingTop: insets.top + 8 }]}
      >
        <View style={styles.heroTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Find Friends</Text>
            <Text style={styles.heroSub}>Search or discover people to connect with</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          {!searchExpanded ? (
            <TouchableOpacity
              style={styles.searchCollapsed}
              onPress={openSearch}
              activeOpacity={0.9}
            >
              <Ionicons name="search" size={20} color={C.muted} />
              <Text style={styles.searchPlaceholder}>Search by name or email</Text>
            </TouchableOpacity>
          ) : null}

          <Animated.View
            pointerEvents={searchExpanded ? 'auto' : 'none'}
            style={[
              styles.searchExpandedWrap,
              {
                flex: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                opacity: searchAnim.interpolate({
                  inputRange: [0, 0.35, 1],
                  outputRange: [0, 0.5, 1],
                }),
                transform: [
                  {
                    scaleX: searchAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {searchExpanded ? (
              <View style={styles.searchInputShell}>
                <TextInput
                  ref={searchInputRef}
                  mode="flat"
                  placeholder="Search by name or email"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={styles.searchInput}
                  underlineColor="transparent"
                  theme={{ colors: { text: C.text, background: 'transparent' } }}
                  left={<TextInput.Icon icon="magnify" color={C.muted} />}
                  right={
                    searchQuery.length > 0 ? (
                      <TextInput.Icon icon="close" color={C.muted} onPress={() => setSearchQuery('')} />
                    ) : undefined
                  }
                  returnKeyType="search"
                />
              </View>
            ) : null}
          </Animated.View>

          {searchExpanded ? (
            <Pressable style={styles.searchCloseBtn} onPress={closeSearch}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>

      {loading && showResults ? (
        <ActivityIndicator color={C.primary} style={styles.inlineLoader} />
      ) : null}

      {showResults ? (
        <FlatList
          data={profiles}
          renderItem={renderUser}
          keyExtractor={(item) => `search-${item.id}`}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyBox}>
                <Ionicons name="search-outline" size={40} color={C.muted} />
                <Text style={styles.emptyTitle}>No users found</Text>
                <Text style={styles.emptySub}>Try a different name or email</Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={suggestions}
          renderItem={renderSuggestionSection}
          keyExtractor={(item) => item.type}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            loadingSuggestions ? (
              <View style={styles.emptyBox}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={styles.emptySub}>Loading suggestions…</Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="people-outline" size={40} color={C.muted} />
                <Text style={styles.emptyTitle}>No suggestions yet</Text>
                <Text style={styles.emptySub}>
                  Tap search above to find friends by name or email
                </Text>
                <TouchableOpacity style={styles.emptySearchBtn} onPress={openSearch}>
                  <Ionicons name="search" size={18} color="#fff" />
                  <Text style={styles.emptySearchBtnText}>Search people</Text>
                </TouchableOpacity>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
    width: Platform.OS === 'web' ? 420 : '100%',
    maxWidth: '100%',
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  heroSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchCollapsed: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchPlaceholder: {
    fontSize: 15,
    color: C.muted,
    flex: 1,
  },
  searchExpandedWrap: {
    overflow: 'hidden',
    minWidth: 0,
  },
  searchInputShell: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    height: 46,
    backgroundColor: 'transparent',
    fontSize: 15,
  },
  searchCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  inlineLoader: {
    marginTop: 12,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 32,
  },
  listHeader: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  resultsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    backgroundColor: C.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
    shadowColor: C.primaryDark,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  userEmail: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  reasonText: {
    fontSize: 12,
    color: C.primary,
    marginTop: 3,
    fontWeight: '500',
  },
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
    backgroundColor: C.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  friendsPill: {
    backgroundColor: '#e8f5e9',
  },
  friendsPillText: {
    color: '#2e7d32',
    fontSize: 12,
    fontWeight: '700',
  },
  pendingPill: {
    backgroundColor: '#fff3e0',
  },
  pendingPillText: {
    color: '#e65100',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginTop: 4,
  },
  emptySub: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptySearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
  },
  emptySearchBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
