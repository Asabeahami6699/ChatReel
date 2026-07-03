import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import { ReelImmersiveViewer } from './ReelImmersiveViewer';

export default function ReelDetailScreen() {
  const route = useRoute<RouteProp<ReelsStackParamList, 'ReelDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<ReelsStackParamList>>();

  const [reels, setReels] = useState<ReelDTO[]>(route.params.contextReels ?? []);
  const [loading, setLoading] = useState(!route.params.contextReels?.length);
  const [error, setError] = useState<string | null>(null);

  const initialIndex =
    route.params.initialIndex ??
    Math.max(0, reels.findIndex((r) => r.id === route.params.reelId));

  useEffect(() => {
    if (route.params.contextReels?.length) {
      setReels(route.params.contextReels);
      setLoading(false);
      return;
    }
    let alive = true;
    api.reels
      .get(route.params.reelId)
      .then((res) => {
        if (alive) {
          setReels([res.reel]);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof ApiError ? err.message : 'Failed to load reel');
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [route.params.contextReels, route.params.reelId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (error || reels.length === 0) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.error}>{error ?? 'Reel not found'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ReelImmersiveViewer
      reels={reels}
      initialIndex={initialIndex >= 0 ? initialIndex : 0}
      onClose={() => navigation.goBack()}
      onReelsChange={setReels}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#f87171', marginBottom: 12 },
  backLink: { padding: 12 },
  backLinkText: { color: '#93c5fd', fontWeight: '600' },
});
