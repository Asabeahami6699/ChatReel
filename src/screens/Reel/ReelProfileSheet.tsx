import React, { useEffect, useState } from 'react';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ReelImmersiveViewer } from './ReelImmersiveViewer';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import { REEL_ACCENT } from './reelTheme';
import { REEL_PHONE_MAX_WIDTH } from './reelVideoLayout';
import { ReelProfileGrid } from './ReelProfileGrid';
import { useReelGridDeleteHandlers } from './useReelGridDelete';
import { useReelProfilePosts } from './useReelProfilePosts';
import { openPostReelCompose } from '../../lib/reelPlaybackBridge';

interface Props {
  reel: ReelDTO;
  onClose: () => void;
  onFollowStateChange?: (authorId: string, state: 'none' | 'pending' | 'following') => void;
}

export default function ReelProfileSheet({ reel, onClose, onFollowStateChange }: Props) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const usePhoneLayout = Platform.OS === 'web' && windowWidth > REEL_PHONE_MAX_WIDTH + 64;
  const contentWidth = usePhoneLayout ? REEL_PHONE_MAX_WIDTH : windowWidth;
  const bottomPad = insets.bottom;

  const author = reel.author;
  const myProfileId = useCurrentProfileId();
  const canDeleteReels = Boolean(author?.id && myProfileId && author.id === myProfileId);

  const [followState, setFollowState] = useState<'none' | 'pending' | 'following'>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [immersiveIndex, setImmersiveIndex] = useState<number | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followersLoading, setFollowersLoading] = useState(true);

  const profileId = author?.id;
  const {
    posts,
    setPosts,
    loading: postsLoading,
    refreshing,
    error,
    setError,
    refresh,
    thumbs,
  } = useReelProfilePosts(profileId, 24);
  const loading = postsLoading && posts.length === 0;
  const { removeOne, removeMany } = useReelGridDeleteHandlers(profileId ?? '', setImmersiveIndex);

  const username =
    author?.display_name?.trim() || author?.email?.split('@')[0] || 'unknown';
  const avatar = author?.avatar_url ?? null;

  useEffect(() => {
    let alive = true;
    if (!author?.id) return;
    setFollowersLoading(true);
    api.friendships
      .followerCount(author.id)
      .then((res) => {
        if (!alive) return;
        setFollowerCount(res.count);
      })
      .catch(() => {
        if (!alive) return;
        setFollowerCount(0);
      })
      .finally(() => {
        if (alive) setFollowersLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [author?.id]);

  useEffect(() => {
    let alive = true;
    if (!author?.id) return;
    api.friendships
      .list()
      .then((res) => {
        if (!alive) return;
        const rows = (res.friendships ?? []) as Array<{
          id?: string;
          user_id?: string;
          friend_id?: string;
          status?: string;
          sender_profile?: { id?: string };
          receiver_profile?: { id?: string };
        }>;
        const rel = rows.find((r) => {
          const a = r.user_id ?? r.sender_profile?.id;
          const b = r.friend_id ?? r.receiver_profile?.id;
          return a === author.id || b === author.id;
        });
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
  }, [author?.id]);

  const totalLikes = posts.reduce((sum, r) => sum + r.like_count, 0);
  const totalViews = posts.reduce((sum, r) => sum + r.view_count, 0);

  const onFollowPress = async () => {
    if (!author?.id || followBusy) return;
    setFollowBusy(true);
    try {
      if (followState === 'none') {
        const result = (await api.friendships.request(author.id)) as {
          friendship?: { id?: string; status?: string };
        };
        setFriendshipId(result.friendship?.id ?? null);
        const nextState = result.friendship?.status === 'accepted' ? 'following' : 'pending';
        setFollowState(nextState);
        onFollowStateChange?.(author.id, nextState);
      } else if (friendshipId) {
        await api.friendships.cancel(friendshipId);
        setFriendshipId(null);
        setFollowState('none');
        onFollowStateChange?.(author.id, 'none');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update follow status');
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <View style={[styles.container, usePhoneLayout && styles.containerPhone]}>
      <View style={[styles.phoneColumn, { width: contentWidth }]}>
        {!usePhoneLayout && <View style={styles.handle} />}

        <View style={[styles.header, { paddingTop: usePhoneLayout ? insets.top + 8 : 0 }]}>
          <View style={styles.headerSide}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.username} numberOfLines={1}>
            @{username}
          </Text>
          <View style={[styles.headerSide, styles.headerSideRight]}>
            <TouchableOpacity style={styles.iconBtn} onPress={refresh} disabled={refreshing}>
              <Ionicons name="refresh" size={20} color={refreshing ? '#666' : '#fff'} />
            </TouchableOpacity>
            {canDeleteReels && (
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => {
                  onClose();
                  openPostReelCompose();
                  navigation.navigate('PostReel');
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
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

        <TouchableOpacity
          style={[
            styles.followBtn,
            followState !== 'none' && styles.followingBtn,
            followBusy && { opacity: 0.6 },
          ]}
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

        {error && <Text style={styles.error}>{error}</Text>}

        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <ReelProfileGrid
            posts={posts}
            canDelete={canDeleteReels}
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

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNumber}>{loading ? '—' : compact(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0K', 'K');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  containerPhone: {
    alignItems: 'center',
    backgroundColor: '#000',
  },
  phoneColumn: {
    flex: 1,
    backgroundColor: '#000',
    maxWidth: '100%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerSide: { width: 36, alignItems: 'center', justifyContent: 'center' },
  headerSideRight: { flexDirection: 'row', gap: 4, width: 'auto' as const, minWidth: 36 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  uploadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: REEL_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: { color: '#fff', fontWeight: '700', fontSize: 17, flex: 1, textAlign: 'center' },
  profileHeader: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, marginRight: 16 },
  avatarFallback: { backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  avatarFallbackText: { color: '#fff', fontSize: 28, fontWeight: '700' },
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
  statNumber: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  loaderBox: { padding: 32, alignItems: 'center' },
  error: { color: '#f87171', textAlign: 'center', marginBottom: 8 },
});
