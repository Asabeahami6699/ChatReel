import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Portal, Snackbar, Text } from 'react-native-paper';
import { ApiError } from '../lib/api';
import { saveRingtoneClip } from '../lib/ringtoneLibrary';
import {
  emitRingtoneSave,
  subscribeRingtoneSave,
  type RingtoneSaveEvent,
} from '../lib/ringtoneSaveNotify';
import type { UserRingtoneDTO } from '../lib/api';

type SnackState = {
  visible: boolean;
  message: string;
  isError?: boolean;
  pending?: boolean;
};

/** Global toast for background ringtone trim/upload (same pattern as AudioExtractToast). */
export function RingtoneSaveToast() {
  const [snackbar, setSnackbar] = useState<SnackState>({ visible: false, message: '' });

  useEffect(() => {
    return subscribeRingtoneSave((event: RingtoneSaveEvent) => {
      if (event.type === 'started') {
        setSnackbar({
          visible: true,
          message: 'Saving ringtone in background…',
          isError: false,
          pending: true,
        });
      } else if (event.type === 'done') {
        setSnackbar({
          visible: true,
          message: 'Ringtone saved to your library',
          isError: false,
          pending: false,
        });
      } else if (event.type === 'error') {
        setSnackbar({
          visible: true,
          message: event.message,
          isError: true,
          pending: false,
        });
        if (Platform.OS === 'web') {
          Alert.alert('Ringtone save failed', event.message);
        }
      }
    });
  }, []);

  return (
    <Portal>
      <View pointerEvents="box-none" style={styles.host}>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar((s) => ({ ...s, visible: false, pending: false }))}
          duration={snackbar.pending ? Snackbar.DURATION_INDEFINITE : 4500}
          style={snackbar.isError ? styles.error : styles.ok}
          theme={{ colors: { onSurface: snackbar.isError ? '#fff' : '#111' } }}
          wrapperStyle={styles.wrapper}
        >
          <Text style={snackbar.isError ? styles.textError : styles.textOk}>{snackbar.message}</Text>
        </Snackbar>
      </View>
    </Portal>
  );
}

/** Close UI first; upload + server trim continue here. */
export function startBackgroundRingtoneSave(input: {
  userId: string;
  localUri: string;
  label: string;
  name?: string | null;
  mimeType?: string | null;
  startSec: number;
  endSec: number;
  afterSave?: (ringtone: UserRingtoneDTO) => void | Promise<void>;
}): void {
  emitRingtoneSave({ type: 'started' });
  void (async () => {
    try {
      const ringtone = await saveRingtoneClip({
        userId: input.userId,
        localUri: input.localUri,
        label: input.label,
        name: input.name,
        mimeType: input.mimeType,
        startSec: input.startSec,
        endSec: input.endSec,
      });
      if (input.afterSave) await input.afterSave(ringtone);
      emitRingtoneSave({ type: 'done', ringtone });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save ringtone';
      emitRingtoneSave({ type: 'error', message });
    }
  })();
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
    justifyContent: 'flex-end',
  },
  wrapper: {
    zIndex: 99999,
    elevation: 99999,
  },
  ok: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  error: { backgroundColor: '#4a1a1a' },
  textOk: { color: '#111', fontWeight: '600' },
  textError: { color: '#fff', fontWeight: '600' },
});
