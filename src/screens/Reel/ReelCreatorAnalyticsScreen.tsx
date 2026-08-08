import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { useReelPlaybackGate } from '../../hooks/useReelPlaybackGate';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import { REEL_ACCENT } from './reelTheme';

type Analytics = Awaited<ReturnType<typeof api.wallet.creatorAnalytics>>['analytics'];

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={REEL_ACCENT} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ReelCreatorAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ReelsStackParamList>>();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useReelPlaybackGate('creator-analytics', true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.wallet.creatorAnalytics();
      setData(res.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Creator analytics</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={REEL_ACCENT} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={styles.grid}>
            <StatCard label="Views" value={data.total_views.toLocaleString()} icon="eye" />
            <StatCard label="Reels" value={data.total_reels} icon="film" />
            <StatCard label="Likes" value={data.total_likes.toLocaleString()} icon="heart" />
            <StatCard label="Gifts" value={data.gift_count} icon="gift" />
            <StatCard
              label="Coins earned"
              value={data.gift_coins_earned.toLocaleString()}
              icon="diamond"
            />
            <StatCard
              label="Lifetime earned"
              value={data.lifetime_earned_coins.toLocaleString()}
              icon="trending-up"
            />
          </View>

          <Text style={styles.section}>Top reels</Text>
          {data.top_reels.length === 0 ? (
            <Text style={styles.empty}>No reels yet — post to start tracking.</Text>
          ) : (
            data.top_reels.map((reel) => (
              <View key={reel.id} style={styles.reelRow}>
                {reel.thumbnail_url ? (
                  <Image source={{ uri: reel.thumbnail_url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Ionicons name="videocam" size={20} color="#666" />
                  </View>
                )}
                <View style={styles.reelMeta}>
                  <Text style={styles.reelCaption} numberOfLines={2}>
                    {reel.caption?.trim() || 'Untitled reel'}
                  </Text>
                  <Text style={styles.reelStats}>
                    {reel.view_count.toLocaleString()} views · {reel.like_count} likes ·{' '}
                    {reel.gift_coin_total} coins
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#f87171', textAlign: 'center', paddingHorizontal: 24 },
  retry: {
    backgroundColor: REEL_ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '31%',
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: '#16161d',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600' },
  section: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 10,
  },
  empty: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  reelRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    backgroundColor: '#16161d',
    borderRadius: 12,
    padding: 10,
  },
  thumb: { width: 56, height: 72, borderRadius: 8, backgroundColor: '#222' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  reelMeta: { flex: 1, justifyContent: 'center', gap: 4 },
  reelCaption: { color: '#fff', fontSize: 13, fontWeight: '700' },
  reelStats: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
});
