import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Portal, Snackbar, Text, ProgressBar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeReelUploadQueue, type ReelUploadTask } from '../lib/reelUploadQueue';

function aggregateProgress(tasks: ReelUploadTask[]): number {
  const active = tasks.filter(
    (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'publishing'
  );
  if (active.length === 0) return 0;
  const sum = active.reduce((acc, t) => acc + (t.progress ?? 0), 0);
  return Math.round(sum / active.length);
}

export function ReelUploadToast() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<ReelUploadTask[]>([]);
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
            setSnackbar({ visible: true, message: 'Reel posted successfully!', isError: false });
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

  const activeTasks = tasks.filter(
    (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'publishing'
  );
  const progress = aggregateProgress(tasks);
  const stage = activeTasks[0]?.stage ?? 'Uploading...';
  const showBanner = activeTasks.length > 0;

  return (
    <Portal>
      {showBanner && (
        <View
          style={[
            styles.banner,
            { bottom: Platform.OS === 'web' ? 16 : insets.bottom + 8 },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.bannerText} numberOfLines={1}>
            {stage}
            {activeTasks.length > 1 ? ` · ${activeTasks.length} uploads` : ''}
          </Text>
          <ProgressBar progress={progress / 100} color="#1e90ff" style={styles.progressBar} />
          <Text style={styles.percentText}>{progress}%</Text>
        </View>
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={4000}
        style={snackbar.isError ? styles.snackbarError : styles.snackbarOk}
        action={{
          label: 'OK',
          onPress: () => setSnackbar((s) => ({ ...s, visible: false })),
        }}
      >
        {snackbar.message}
      </Snackbar>
    </Portal>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
    zIndex: 9999,
    elevation: 8,
  },
  bannerText: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: '#333' },
  percentText: { color: '#9eb4c7', fontSize: 11, marginTop: 4, textAlign: 'right' },
  snackbarOk: { backgroundColor: '#1a472a' },
  snackbarError: { backgroundColor: '#4a1a1a' },
});
