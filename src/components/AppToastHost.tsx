import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Portal, Snackbar } from 'react-native-paper';
import {
  clearAppToast,
  scheduleAppToastClear,
  subscribeAppToast,
} from '../lib/appToast';

/** Global snackbar host for short status toasts. */
export function AppToastHost() {
  const [toast, setToast] = useState<{
    message: string;
    isError?: boolean;
    durationMs: number;
  } | null>(null);

  useEffect(() => {
    return subscribeAppToast((next) => {
      if (!next) {
        setToast(null);
        return;
      }
      setToast({
        message: next.message,
        isError: next.isError,
        durationMs: next.durationMs ?? 3200,
      });
      scheduleAppToastClear(next.durationMs ?? 3200);
    });
  }, []);

  return (
    <Portal>
      <Snackbar
        visible={Boolean(toast)}
        onDismiss={() => clearAppToast()}
        duration={toast?.durationMs ?? 3200}
        style={toast?.isError ? { backgroundColor: '#dc2626' } : { backgroundColor: '#111827' }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>{toast?.message ?? ''}</Text>
      </Snackbar>
    </Portal>
  );
}
