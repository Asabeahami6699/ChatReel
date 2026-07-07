import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import type { RootStackParamList } from '../../navigation/rootNavigation';
import { ReelMediaViewer } from './ReelMediaViewer';
import { useReelPlaybackGate } from '../../hooks/useReelPlaybackGate';

export default function ReelPreviewScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ReelPreview'>>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [reel, setReel] = useState<ReelDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shouldPlay, setShouldPlay] = useState(true);

  useReelPlaybackGate('reel-preview', true);

  useFocusEffect(
    useCallback(() => {
      setShouldPlay(true);
      return () => setShouldPlay(false);
    }, [])
  );

  useEffect(() => {
    let alive = true;
    api.reels
      .get(route.params.reelId)
      .then((res) => {
        if (alive) {
          setReel(res.reel);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof ApiError ? e.message : 'Failed to load reel');
      });
    return () => {
      alive = false;
    };
  }, [route.params.reelId]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity style={[styles.close, { top: insets.top + 8 }]} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={26} color="#fff" />
      </TouchableOpacity>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !reel ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <ReelMediaViewer reel={reel} shouldPlay={shouldPlay} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: '#f87171' },
});
