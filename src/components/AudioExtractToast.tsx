import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Portal, Snackbar, Text } from 'react-native-paper';
import {
  emitReelAudioExtract,
  subscribeReelAudioExtract,
  type ReelAudioExtractEvent,
} from '../lib/reelAudioExtractNotify';
import { uploadReelExtractTemp } from '../lib/reelUploader';
import { ApiError, api } from '../lib/api';

type SnackState = {
  visible: boolean;
  message: string;
  isError?: boolean;
  pending?: boolean;
};

/** Global toast for background reel audio extraction. */
export function AudioExtractToast() {
  const [snackbar, setSnackbar] = useState<SnackState>({ visible: false, message: '' });

  useEffect(() => {
    return subscribeReelAudioExtract((event: ReelAudioExtractEvent) => {
      if (event.type === 'started') {
        setSnackbar({
          visible: true,
          message: 'Extracting audio in background…',
          isError: false,
          pending: true,
        });
      } else if (event.type === 'done') {
        setSnackbar({
          visible: true,
          message: 'Audio saved to My uploads',
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
        // Snackbar can sit under modals on web — surface a hard alert too.
        if (Platform.OS === 'web') {
          Alert.alert('Audio extract failed', event.message);
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

/** Fire-and-forget extract; completion surfaces via AudioExtractToast. */
export function startBackgroundReelAudioExtract(input: {
  uri: string;
  fileName?: string;
  mime?: string;
  durationSec: number;
}): void {
  emitReelAudioExtract({ type: 'started' });
  void (async () => {
    try {
      const videoUrl = await uploadReelExtractTemp({
        uri: input.uri,
        fileName: input.fileName,
        contentType: input.mime,
      });
      const { sound } = await api.reels.extractSound({
        video_url: videoUrl,
        title: 'Extracted audio',
        duration_sec: Math.max(1, Math.round(input.durationSec || 0)) || undefined,
      });
      emitReelAudioExtract({ type: 'done', sound });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not extract audio';
      emitReelAudioExtract({ type: 'error', message });
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
