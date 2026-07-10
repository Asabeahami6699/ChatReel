import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { Portal, Snackbar, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  subscribeReelUploadQueue,
  subscribeFailedUploadMovedToDraft,
  type ReelUploadTask,
} from '../lib/reelUploadQueue';

function aggregateProgress(tasks: ReelUploadTask[]): number {
  const active = tasks.filter(
    (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'publishing'
  );
  if (active.length === 0) return 0;
  const sum = active.reduce((acc, t) => acc + (t.progress ?? 0), 0);
  return Math.round(sum / active.length);
}

function CircularProgress({ progress, size = 44 }: { progress: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <View style={[styles.circleOuter, { width: size, height: size, borderRadius: size / 2 }]}>
      <View
        style={[
          styles.circleFill,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: '#007AFF',
            borderTopColor: pct >= 25 ? '#007AFF' : 'transparent',
            borderRightColor: pct >= 50 ? '#007AFF' : 'transparent',
            borderBottomColor: pct >= 75 ? '#007AFF' : 'transparent',
            borderLeftColor: pct >= 100 ? '#007AFF' : 'transparent',
          },
        ]}
      />
      <Text style={styles.circleText}>{pct}%</Text>
    </View>
  );
}

export function ReelUploadToast() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<ReelUploadTask[]>([]);
  const [visible, setVisible] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; isError?: boolean }>({
    visible: false,
    message: '',
  });
  const prevStatusRef = useRef<Map<string, ReelUploadTask['status']>>(new Map());

  useEffect(() => {
    return subscribeReelUploadQueue((next) => {
      for (const task of next) {
        const prev = prevStatusRef.current.get(task.id);
        if (prev !== task.status) {
          if (task.status === 'done') {
            const msg =
              task.stage === 'Under review'
                ? 'Reel submitted — we’ll notify you when it’s live'
                : 'Reel posted!';
            setSnackbar({ visible: true, message: msg, isError: false });
          } else if (task.status === 'error') {
            setSnackbar({
              visible: true,
              message: task.error ?? 'Reel upload failed',
              isError: true,
            });
          }
          prevStatusRef.current.set(task.id, task.status);
        }
      }
      setTasks(next);
    });
  }, []);

  useEffect(() => {
    return subscribeFailedUploadMovedToDraft(({ label }) => {
      setSnackbar({
        visible: true,
        message: `Upload failed too many times — saved as draft: ${label}`,
        isError: true,
      });
    });
  }, []);

  const activeTasks = tasks.filter(
    (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'publishing'
  );
  const progress = aggregateProgress(tasks);
  const stage = activeTasks[0]?.stage ?? 'Uploading…';

  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (activeTasks.length > 0) {
      setVisible(true);
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      return;
    }
    if (visible) {
      hideTimer.current = setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() =>
          setVisible(false)
        );
      }, 1200);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [activeTasks.length, fade, visible]);

  const showIndicator = false;

  return (
    <Portal>
      {showIndicator && (
        <Animated.View
          style={[
            styles.floatingChip,
            {
              bottom: Platform.OS === 'web' ? 24 : insets.bottom + 72,
              opacity: fade,
            },
          ]}
          pointerEvents="none"
        >
          <CircularProgress progress={progress} />
          <View style={styles.chipTextWrap}>
            <Ionicons name="cloud-upload-outline" size={14} color="#007AFF" />
            <Text style={styles.chipText} numberOfLines={1}>
              {stage}
              {activeTasks.length > 1 ? ` · ${activeTasks.length}` : ''}
            </Text>
          </View>
        </Animated.View>
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={3000}
        style={snackbar.isError ? styles.snackbarError : styles.snackbarOk}
        theme={{ colors: { onSurface: snackbar.isError ? '#fff' : '#111' } }}
      >
        <Text style={snackbar.isError ? styles.snackbarTextError : styles.snackbarTextOk}>
          {snackbar.message}
        </Text>
      </Snackbar>
    </Portal>
  );
}

const styles = StyleSheet.create({
  floatingChip: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(18,18,18,0.94)',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
    zIndex: 9999,
    elevation: 8,
    maxWidth: 220,
  },
  chipTextWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  circleOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
  },
  circleFill: {
    position: 'absolute',
    borderWidth: 3,
  },
  circleText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  snackbarOk: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  snackbarError: { backgroundColor: '#4a1a1a' },
  snackbarTextOk: { color: '#111', fontWeight: '600' },
  snackbarTextError: { color: '#fff', fontWeight: '600' },
});
