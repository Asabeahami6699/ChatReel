import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { ReelMediaViewer } from './ReelMediaViewer';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import ReelCommentSheet from './ReelCommentSheet';

export default function ReelDetailScreen() {
  const route = useRoute<RouteProp<ReelsStackParamList, 'ReelDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<ReelsStackParamList>>();
  const insets = useSafeAreaInsets();

  const [reel, setReel] = useState<ReelDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState(false);

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
  }, [route.params.reelId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (error || !reel) {
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

  const author =
    reel.author?.display_name?.trim() ||
    reel.author?.email?.split('@')[0] ||
    'unknown';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.videoShell}>
        <ReelMediaViewer reel={reel} shouldPlay />
      </View>

      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="close" size={26} color="#fff" />
      </TouchableOpacity>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.caption} numberOfLines={2}>
          {reel.caption || `@${author}`}
        </Text>
        <TouchableOpacity style={styles.commentBtn} onPress={() => setOpenComments(true)}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" />
          <Text style={styles.commentBtnText}>{reel.comment_count} comments</Text>
        </TouchableOpacity>
      </View>

      {openComments && (
        <View style={styles.commentSheet}>
          <ReelCommentSheet
            reelId={reel.id}
            onClose={() => setOpenComments(false)}
            onCommentAdded={() =>
              setReel((r) => (r ? { ...r, comment_count: r.comment_count + 1 } : r))
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  videoShell: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoFrame: { backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  caption: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 10 },
  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentBtnText: { color: '#fff', fontWeight: '600' },
  commentSheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  error: { color: '#f87171', marginBottom: 12 },
  backLink: { padding: 12 },
  backLinkText: { color: '#93c5fd', fontWeight: '600' },
});
