import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, ApiError, type ReelAuthorDTO, type ReelDTO } from '../../lib/api';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import { reelTabBarOffset } from './ReelsTabBar';

type SearchTab = 'all' | 'videos' | 'users';

type ProfileRow = ReelAuthorDTO;

function displayName(p: ProfileRow): string {
  return p.display_name?.trim() || p.email?.split('@')[0] || 'unknown';
}

export default function ReelSearchScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = reelTabBarOffset(insets.bottom);
  const navigation = useNavigation<NativeStackNavigationProp<ReelsStackParamList>>();

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('all');
  const [reels, setReels] = useState<ReelDTO[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setReels([]);
      setProfiles([]);
      setError(null);
      return;
    }

    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      api.reels
        .search(q)
        .then((res) => {
          if (!alive) return;
          setReels(res.reels ?? []);
          setProfiles((res.profiles ?? []) as ProfileRow[]);
          setError(null);
        })
        .catch((err) => {
          if (!alive) return;
          setError(err instanceof ApiError ? err.message : 'Search failed');
          setReels([]);
          setProfiles([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 300);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const showVideos = tab === 'all' || tab === 'videos';
  const showUsers = tab === 'all' || tab === 'users';
  const videoRows = showVideos ? reels : [];
  const userRows = showUsers ? profiles : [];

  const openReel = (reel: ReelDTO) => {
    navigation.navigate('ReelDetail', { reelId: reel.id });
  };

  const openCreator = (p: ProfileRow) => {
    navigation.navigate('ReelCreatorProfile', {
      profileId: p.id,
      displayName: displayName(p),
    });
  };

  const openMyAccount = () => {
    navigation.navigate('ReelAccount');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Videos, creators, captions…"
            placeholderTextColor="#666"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabs}>
          {(['all', 'videos', 'users'] as SearchTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabChip, tab === t && styles.tabChipActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabChipText, tab === t && styles.tabChipTextActive]}>
                {t === 'all' ? 'All' : t === 'videos' ? 'Videos' : 'Users'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <FlatList
          data={[
            ...videoRows.map((r) => ({ kind: 'video' as const, key: `v-${r.id}`, reel: r })),
            ...userRows.map((p) => ({ kind: 'user' as const, key: `u-${p.id}`, profile: p })),
          ]}
          keyExtractor={(item) => item.key}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 16 }]}
          ListHeaderComponent={
            !query.trim() ? (
              <TouchableOpacity style={styles.accountCard} onPress={openMyAccount}>
                <Ionicons name="person-circle-outline" size={28} color="#fff" />
                <View style={styles.accountCardText}>
                  <Text style={styles.accountCardTitle}>Your reel account</Text>
                  <Text style={styles.accountCardSub}>Manage your profile and posts</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#666" />
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.kind === 'video') {
              const reel = item.reel;
              const thumb = reel.thumbnail_url;
              const author = reel.author;
              return (
                <TouchableOpacity style={styles.videoRow} onPress={() => openReel(reel)} activeOpacity={0.85}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.videoThumb} />
                  ) : (
                    <View style={[styles.videoThumb, styles.thumbPlaceholder]}>
                      <Ionicons name="film-outline" size={22} color="#666" />
                    </View>
                  )}
                  <View style={styles.videoBody}>
                    <Text style={styles.videoCaption} numberOfLines={2}>
                      {reel.caption?.trim() || 'Reel video'}
                    </Text>
                    <Text style={styles.videoMeta}>
                      @{author?.display_name?.trim() || author?.email?.split('@')[0] || 'creator'}
                    </Text>
                  </View>
                  <Ionicons name="play-circle" size={22} color="#fff" />
                </TouchableOpacity>
              );
            }

            const p = item.profile;
            return (
              <TouchableOpacity style={styles.userRow} onPress={() => openCreator(p)} activeOpacity={0.85}>
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>{displayName(p).charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.userBody}>
                  <Text style={styles.userTitle}>@{displayName(p)}</Text>
                  <Text style={styles.userSub}>View creator reels</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#666" />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="search-outline" size={48} color="#444" />
              <Text style={styles.emptyText}>
                {query.trim() ? 'No videos or users found' : 'Search reels and creators'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
  },
  tabChipActive: { backgroundColor: '#fff' },
  tabChipText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  tabChipTextActive: { color: '#000' },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  accountCardText: { flex: 1 },
  accountCardTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  accountCardSub: { color: '#888', fontSize: 12, marginTop: 2 },
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  videoThumb: { width: 56, height: 72, borderRadius: 8, backgroundColor: '#222' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  videoBody: { flex: 1 },
  videoCaption: { color: '#fff', fontSize: 14, fontWeight: '600' },
  videoMeta: { color: '#888', fontSize: 12, marginTop: 4 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '700' },
  userBody: { flex: 1 },
  userTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  userSub: { color: '#888', fontSize: 12, marginTop: 2 },
  center: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
  emptyText: { color: '#666', marginTop: 12, fontSize: 15, textAlign: 'center' },
  error: { color: '#f87171', textAlign: 'center', paddingHorizontal: 16, marginBottom: 8 },
});
