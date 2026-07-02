import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Portal, Snackbar, Text, ProgressBar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  subscribeMomentUploadQueue,
  type MomentUploadTask,
} from '../lib/momentUploadQueue';

function aggregateProgress(tasks: MomentUploadTask[]): number {
  const active = tasks.filter(
    (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'publishing'
  );
  if (active.length === 0) return 0;
  return Math.round(active.reduce((acc, t) => acc + t.progress, 0) / active.length);
}

export function MomentUploadToast() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<MomentUploadTask[]>([]);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; isError?: boolean }>({
    visible: false,
    message: '',
  });
  const prevStatusRef = useRef<Map<string, MomentUploadTask['status']>>(new Map());

  useEffect(() => {
    return subscribeMomentUploadQueue((next) => {
      for (const task of next) {
        const prev = prevStatusRef.current.get(task.id);
        if (prev !== task.status) {
          if (task.status === 'done') {
            setSnackbar({ visible: true, message: 'Moment posted!', isError: false });
          } else if (task.status === 'error') {
            setSnackbar({
              visible: true,
              message: task.error ?? 'Moment upload failed',
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
  const stage = activeTasks[0]?.stage ?? 'Posting moment…';
  const showBanner = activeTasks.length > 0;

  return (
    <Portal>
      {showBanner && (
        <View
          style={[
            styles.banner,
            { bottom: Platform.OS === 'web' ? 16 : insets.bottom + 72 },
          ]}
        >
          <Text style={styles.bannerText}>{stage}</Text>
          <ProgressBar progress={progress / 100} color="#007AFF" style={styles.bar} />
        </View>
      )}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={3000}
        style={snackbar.isError ? styles.snackError : undefined}
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  bannerText: { fontSize: 14, fontWeight: '600', color: '#1c1c1e', marginBottom: 8 },
  bar: { height: 4, borderRadius: 2, backgroundColor: '#e2eaf3' },
  snackError: { backgroundColor: '#dc2626' },
});
