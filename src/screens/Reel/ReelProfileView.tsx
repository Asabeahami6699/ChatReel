import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ReelImmersiveViewer } from './ReelImmersiveViewer';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { openPostReelCompose } from '../../lib/reelPlaybackBridge';
import type { SavedReelComposeDraft } from '../../lib/reelComposeDraftStore';
import { useReelPlaybackGate } from '../../hooks/useReelPlaybackGate';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import { REEL_ACCENT } from './reelTheme';
import { reelTabBarOffset } from './ReelsTabBar';
import { REEL_PHONE_MAX_WIDTH } from './reelVideoLayout';
import { ReelProfileGrid } from './ReelProfileGrid';
import { ReelProfileMenuFloat } from './ReelProfileMenuFloat';
import { useReelGridDeleteHandlers } from './useReelGridDelete';
import { useReelProfilePosts } from './useReelProfilePosts';

type Props = {
  profileId: string;
  isSelf?: boolean;
  showBack?: boolean;
};

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0K', 'K');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNumber}>{loading ? '—' : compact(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ReelProfileView({ profileId, isSelf = false, showBack = false }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const usePhoneLayout = Platform.OS === 'web' && windowWidth > REEL_PHONE_MAX_WIDTH + 64;
  const contentWidth = usePhoneLayout ? REEL_PHONE_MAX_WIDTH : windowWidth;
  const bottomPad = reelTabBarOffset(insets.bottom, usePhoneLayout);
  const navigation = useNavigation<NativeStackNavigationProp<ReelsStackParamList>>();

  const [profile, setProfile] = useState<{
    display_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null>(null);
  const {
    posts,
    setPosts,
    loading: postsLoading,
    refreshing,
    error,
    setError,
    refresh,
    thumbs,
  } = useReelProfilePosts(profileId, 48);
  const [profileLoading, setProfileLoading] = useState(true);
  const loading = (postsLoading && posts.length === 0) || profileLoading;
  const [followState, setFollowState] = useState<'none' | 'pending' | 'following'>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [immersiveIndex, setImmersiveIndex] = useState<number | null>(null);
  useReelPlaybackGate('profile-immersive', immersiveIndex != null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followersLoading, setFollowersLoading] = useState(true);
  const { removeOne, removeMany } = useReelGridDeleteHandlers(profileId, setImmersiveIndex);

  const username =
    profile?.display_name?.trim() || profile?.email?.split('@')[0] || 'unknown';
  const avatar = profile?.avatar_url ?? null;

  const loadProfile = useCallback(async () => {
    if (isSelf) {
      const { profile: me } = await api.profiles.me();
      setProfile(me as typeof profile);
    }
  }, [isSelf]);

  useEffect(() => {
    let alive = true;
    setProfileLoading(true);
    loadProfile()
      .then(() => {
        if (!alive) return;
        if (!isSelf) {
          return api.reels.byUser(profileId, 1).then((reelsRes) => {
            if (reelsRes.reels[0]?.author) setProfile(reelsRes.reels[0].author);
          });
        }
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load profile');
      })
      .finally(() => {
        if (alive) setProfileLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [profileId, isSelf, loadProfile, setError]);

  useEffect(() => {
    let alive = true;
    setFollowersLoading(true);
    api.friendships
      .followerCount(profileId)
      .then((res) => {
        if (alive) setFollowerCount(res.count);
      })
      .catch(() => {
        if (alive) setFollowerCount(0);
      })
      .finally(() => {
        if (alive) setFollowersLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [profileId]);

  useEffect(() => {
    if (isSelf) return;
    let alive = true;
    api.friendships
      .list()
      .then((res) => {
        if (!alive) return;
        const rows = res.friendships ?? [];
        const rel = rows.find((r) => {
          const a = (r as { user_id?: string }).user_id;
          const b = (r as { friend_id?: string }).friend_id;
          return a === profileId || b === profileId;
        }) as { id?: string; status?: string } | undefined;
        if (!rel) {
          setFollowState('none');
          setFriendshipId(null);
          return;
        }
        setFriendshipId(rel.id ?? null);
        if (rel.status === 'accepted') setFollowState('following');
        else if (rel.status === 'pending') setFollowState('pending');
        else setFollowState('none');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [profileId, isSelf]);

  const totalLikes = posts.reduce((sum, r) => sum + r.like_count, 0);
  const totalViews = posts.reduce((sum, r) => sum + r.view_count, 0);

  const onFollowPress = async () => {
    if (isSelf || followBusy) return;
    setFollowBusy(true);
    try {
      if (followState === 'none') {
        const result = (await api.friendships.request(profileId)) as {
          friendship?: { id?: string; status?: string };
        };
        setFriendshipId(result.friendship?.id ?? null);
        setFollowState(result.friendship?.status === 'accepted' ? 'following' : 'pending');
      } else if (friendshipId) {
        await api.friendships.cancel(friendshipId);
        setFriendshipId(null);
        setFollowState('none');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update follow status');
    } finally {
      setFollowBusy(false);
    }
  };

  const openPostReel = (draft?: SavedReelComposeDraft) => {
    openPostReelCompose(draft);
    if (rootNavigationRef.isReady()) rootNavigationRef.navigate('PostReel');
  };

  return (
    <View style={[styles.container, usePhoneLayout && styles.containerPhone]}>
      <View style={[styles.phoneColumn, { width: contentWidth }]}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {showBack ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={styles.username}>@{username}</Text>
        {isSelf ? (
          <View style={styles.iconBtn} />
        ) : (
          <TouchableOpacity style={styles.iconBtn} onPress={refresh} disabled={refreshing}>
            <Ionicons name="refresh" size={20} color={refreshing ? '#666' : '#fff'} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.profileHeader}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{username.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.stats}>
          <Stat label="Reels" value={posts.length} loading={loading} />
          <Stat label="Followers" value={followerCount} loading={followersLoading} />
          <Stat label="Likes" value={totalLikes} loading={loading} />
          <Stat label="Views" value={totalViews} loading={loading} />
        </View>
      </View>

      {!isSelf && (
        <TouchableOpacity
          style={[styles.followBtn, followState !== 'none' && styles.followingBtn, followBusy && { opacity: 0.6 }]}
          onPress={onFollowPress}
          disabled={followBusy}
        >
          <Ionicons
            name={followState === 'none' ? 'person-add' : 'person-remove'}
            size={16}
            color="#fff"
          />
          <Text style={styles.followText}>
            {followState === 'none'
              ? 'Follow'
              : followState === 'pending'
                ? 'Requested'
                : 'Following'}
          </Text>
        </TouchableOpacity>
      )}

      {isSelf && (
        <TouchableOpacity style={styles.followBtn} onPress={() => openPostReel()}>
          <Ionicons name="videocam" size={16} color="#fff" />
          <Text style={styles.followText}>Post a reel</Text>
        </TouchableOpacity>
      )}

      {isSelf ? (
        <ReelProfileMenuFloat
          topOffset={insets.top + 8}
          onNewReel={() => openPostReel()}
          onOpenDraft={(draft) => openPostReel(draft)}
        />
      ) : null}

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <ReelProfileGrid
          posts={posts}
          canDelete={isSelf}
          contentWidth={contentWidth}
          bottomPad={bottomPad}
          generatedThumbs={thumbs}
          onOpen={setImmersiveIndex}
          onDeleted={removeOne}
          onDeletedMany={removeMany}
          refreshing={refreshing}
          onRefresh={refresh}
        />
      )}

      <Modal visible={immersiveIndex != null} animationType="slide" onRequestClose={() => setImmersiveIndex(null)}>
        {immersiveIndex != null && (
          <ReelImmersiveViewer
            reels={posts}
            initialIndex={immersiveIndex}
            onClose={() => setImmersiveIndex(null)}
            onReelsChange={setPosts}
            disableProfileNavigation
          />
        )}
      </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  containerPhone: {
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  phoneColumn: {
    flex: 1,
    backgroundColor: '#000',
    maxWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  username: { color: '#fff', fontWeight: '700', fontSize: 17 },
  uploadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1976d2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12 },
  avatarFallback: { backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  avatarFallbackText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  followBtn: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: REEL_ACCENT,
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  followingBtn: { backgroundColor: '#334155' },
  followText: { color: '#fff', fontWeight: '700' },
  stat: { alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 10, marginTop: 2 },
  loaderBox: { padding: 32, alignItems: 'center' },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: '#888', marginTop: 10 },
  error: { color: '#f87171', textAlign: 'center', marginBottom: 8 },
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  viewerVideoShell: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewerVideoFrame: { backgroundColor: '#000' },
  viewerClose: {
    position: 'absolute',
    top: 48,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerActions: {
    position: 'absolute',
    right: 16,
    bottom: 48,
    gap: 16,
  },
  viewerActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  subModalSheet: {
    height: '78%',
    backgroundColor: '#111',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
});
