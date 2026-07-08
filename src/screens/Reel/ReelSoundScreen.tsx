import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type ReelDTO, type ReelSoundDTO } from '../../lib/api';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import { fetchSoundFromReel } from '../../lib/reelSoundFromReelClient';
import { openPostReelWithSound } from '../../lib/reelPlaybackBridge';
import { REEL_ACCENT } from './reelTheme';
import { soundLabel } from './ReelSoundPicker';

export default function ReelSoundScreen() {
  const route = useRoute<RouteProp<ReelsStackParamList, 'ReelSound'>>();
  const navigation = useNavigation<NativeStackNavigationProp<ReelsStackParamList>>();
  const insets = useSafeAreaInsets();

  const [sound, setSound] = useState<ReelSoundDTO | null>(null);
  const [reels, setReels] = useState<ReelDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { soundId, fromReelId } = route.params;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let resolvedSoundId = soundId;
      if (!resolvedSoundId && fromReelId) {
        const extracted = await fetchSoundFromReel(fromReelId);
        resolvedSoundId = extracted.id;
        setSound(extracted);
      }
      if (!resolvedSoundId) {
        setError('Sound not found');
        return;
      }
      const res = await api.reels.soundReels(resolvedSoundId, { limit: 30 });
      setSound(res.sound);
      setReels(res.reels ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load sound');
    } finally {
      setLoading(false);
    }
  }, [soundId, fromReelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReel = useCallback(
    (reel: ReelDTO, index: number) => {
      navigation.navigate('ReelDetail', {
        reelId: reel.id,
        contextReels: reels,
        initialIndex: index,
      });
    },
    [navigation, reels]
  );

  const useSound = useCallback(() => {
    if (!sound) return;
    openPostReelWithSound(sound);
    navigation.navigate('PostReel');
  }, [navigation, sound]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerBody}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {sound ? soundLabel(sound) : 'Sound'}
          </Text>
          {sound && sound.usage_count > 0 ? (
            <Text style={styles.headerSub}>{sound.usage_count} reels</Text>
          ) : null}
          {sound?.genre ? (
            <Text style={styles.headerTag}>
              {sound.genre}
              {sound.mood ? ` · ${sound.mood}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={REEL_ACCENT} />
          {fromReelId && !soundId ? (
            <Text style={styles.extracting}>Preparing original audio…</Text>
          ) : null}
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => void load()}>
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : reels.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No public reels use this sound yet.</Text>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
          renderItem={({ item, index }) => {
            const thumb = item.thumbnail_url ?? item.media?.[0]?.thumbnail_url;
            return (
              <TouchableOpacity style={styles.tile} onPress={() => openReel(item, index)}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.tileImage} />
                ) : (
                  <View style={[styles.tileImage, styles.tileFallback]}>
                    <Ionicons name="videocam" size={24} color="#666" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {sound ? (
        <View style={[styles.useBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.useBtn} onPress={useSound} activeOpacity={0.9}>
            <Ionicons name="add-circle" size={22} color="#fff" />
            <Text style={styles.useBtnText}>Use this sound</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const GAP = 2;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  headerBody: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#888', fontSize: 12, marginTop: 2 },
  headerTag: { color: '#aaa', fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  headerSpacer: { width: 26 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  extracting: { color: '#aaa', fontSize: 14, marginTop: 12, textAlign: 'center' },
  error: { color: '#ff6b6b', textAlign: 'center', marginBottom: 12 },
  retry: { color: REEL_ACCENT, fontWeight: '600' },
  empty: { color: '#888', textAlign: 'center' },
  tile: {
    flex: 1 / 3,
    aspectRatio: 9 / 16,
    padding: GAP / 2,
  },
  tileImage: { flex: 1, borderRadius: 4, backgroundColor: '#111' },
  tileFallback: { alignItems: 'center', justifyContent: 'center' },
  useBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#222',
  },
  useBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: REEL_ACCENT,
    borderRadius: 28,
    paddingVertical: 14,
  },
  useBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
