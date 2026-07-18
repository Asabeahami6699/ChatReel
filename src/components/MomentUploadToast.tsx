import React, { useEffect, useRef, useState } from 'react';
import { Portal, Snackbar, Text } from 'react-native-paper';
import {
  subscribeMomentUploadQueue,
  type MomentUploadTask,
} from '../lib/momentUploadQueue';

/** Snackbar-only feedback; progress lives on the Moments strip thumbnails. */
export function MomentUploadToast() {
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    isError?: boolean;
  }>({
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
              message: task.error ?? 'Moment upload failed — tap retry on the thumbnail',
              isError: true,
            });
          }
          prevStatusRef.current.set(task.id, task.status);
        }
      }
    });
  }, []);

  return (
    <Portal>
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={3200}
        style={
          snackbar.isError
            ? { backgroundColor: '#dc2626' }
            : {
                backgroundColor: '#ffffff',
                borderWidth: 1,
                borderColor: 'rgba(0, 0, 0, 0.08)',
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }
        }
      >
        <Text style={{ color: snackbar.isError ? '#fff' : '#1f2937', fontWeight: '600' }}>
          {snackbar.message}
        </Text>
      </Snackbar>
    </Portal>
  );
}
