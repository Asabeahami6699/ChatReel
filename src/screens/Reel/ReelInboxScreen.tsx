import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, ApiError, type ReelInboxItemDTO } from '../../lib/api';
import { useRealtimeTopic } from '../../hooks/useRealtimeTopic';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import { reelTabBarOffset } from './ReelsTabBar';
import { REEL_ACCENT } from './reelTheme';

function actorName(item: ReelInboxItemDTO): string {
  return (
    item.actor?.display_name?.trim() ||
    item.actor?.email?.split('@')[0] ||
    'Someone'
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function activityLine(item: ReelInboxItemDTO): string {
  switch (item.type) {
    case 'like':
      return ' liked your reel';
    case 'comment':
      return ' commented on your reel';
    case 'gift':
      return ' sent a gift on your reel';
    default:
      return ' interacted with your reel';
  }
}

export default function ReelInboxScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = reelTabBarOffset(insets.bottom);
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<ReelsStackParamList>>();

  const [items, setItems] = useState<ReelInboxItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { items: rows } = await api.reels.inbox();
      setItems(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) void load();
  }, [isFocused, load]);

  useRealtimeTopic('reelLikes', () => {
    if (isFocused) void load(true);
  });
  useRealtimeTopic('reelComments', () => {
    if (isFocused) void load(true);
  });
  useRealtimeTopic('reelGifts', () => {
    if (isFocused) void load(true);
  });

  const openItem = (item: ReelInboxItemDTO) => {
    if (item.reel?.id) {
      navigation.navigate('ReelDetail', { reelId: item.reel.id });
      return;
    }
    if (item.actor?.id) {
      navigation.navigate('ReelCreatorProfile', {
        profileId: item.actor.id,
        displayName: actorName(item),
      });
    }
  };

  const renderItem = ({ item }: { item: ReelInboxItemDTO }) => (
    <TouchableOpacity style={styles.row} onPress={() => openItem(item)} activeOpacity={0.85}>
      {item.actor?.avatar_url ? (
        <Image source={{ uri: item.actor.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>{actorName(item).charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowText}>
          <Text style={styles.rowBold}>@{actorName(item)}</Text>
          {activityLine(item)}
        </Text>
        {item.type === 'comment' && item.comment?.content ? (
          <Text style={styles.commentPreview} numberOfLines={2}>
            "{item.comment.content}"
          </Text>
        ) : null}
        {item.type === 'gift' && item.gift ? (
          <Text style={styles.giftPreview} numberOfLines={1}>
            {item.gift.emoji} {item.gift.name} · {item.gift.coin_amount} coins
          </Text>
        ) : null}
        <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
      </View>
      {item.reel?.thumbnail_url ? (
        <Image source={{ uri: item.reel.thumbnail_url }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons
            name={
              item.type === 'like' ? 'heart' : item.type === 'gift' ? 'gift' : 'chatbubble'
            }
            size={18}
            color={
              item.type === 'like' ? REEL_ACCENT : item.type === 'gift' ? '#fff' : '#93c5fd'
            }
          />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Reel activity</Text>
        <Text style={styles.subtitle}>Likes, comments, and gifts on your reels</Text>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 16 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#fff" />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="notifications-outline" size={48} color="#444" />
              <Text style={styles.emptyText}>No reel activity yet</Text>
              <Text style={styles.emptyHint}>
                When someone likes, comments, or sends a gift, it shows up here
              </Text>
            </View>
          }
        />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 14, marginTop: 4 },
  list: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
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
  rowBody: { flex: 1 },
  rowText: { color: '#ddd', fontSize: 14, lineHeight: 20 },
  rowBold: { color: '#fff', fontWeight: '700' },
  commentPreview: { color: '#aaa', fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  giftPreview: { color: '#ddd', fontSize: 13, marginTop: 4, fontWeight: '600' },
  time: { color: '#666', fontSize: 12, marginTop: 4 },
  thumb: { width: 44, height: 56, borderRadius: 6, backgroundColor: '#222' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 24 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12, fontWeight: '600' },
  emptyHint: { color: '#555', fontSize: 13, marginTop: 6, textAlign: 'center' },
  error: { color: '#f87171', textAlign: 'center', padding: 12 },
});
