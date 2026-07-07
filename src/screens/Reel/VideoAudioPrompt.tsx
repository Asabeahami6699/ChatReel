import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { REEL_ACCENT } from './reelTheme';

export type VideoAudioChoice = 'keep' | 'extract' | 'music';

type Props = {
  visible: boolean;
  busy?: boolean;
  busyLabel?: string;
  onChoose: (choice: VideoAudioChoice) => void;
  onDismiss: () => void;
};

export function VideoAudioPrompt({
  visible,
  busy,
  busyLabel = 'Extracting audio…',
  onChoose,
  onDismiss,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>This video has sound</Text>
          <Text style={styles.subtitle}>
            Keep the original audio, save it to My uploads, or mute the video and add music from the library.
          </Text>

          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={REEL_ACCENT} />
              <Text style={styles.busyText}>{busyLabel}</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.option} onPress={() => onChoose('keep')}>
                <Ionicons name="volume-high-outline" size={22} color="#fff" />
                <View style={styles.optionBody}>
                  <Text style={styles.optionTitle}>Keep original sound</Text>
                  <Text style={styles.optionSub}>Post with the video&apos;s own audio</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.option} onPress={() => onChoose('extract')}>
                <Ionicons name="musical-notes-outline" size={22} color="#fff" />
                <View style={styles.optionBody}>
                  <Text style={styles.optionTitle}>Extract to My uploads</Text>
                  <Text style={styles.optionSub}>Save the audio track; you can delete it later</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.option} onPress={() => onChoose('music')}>
                <Ionicons name="headset-outline" size={22} color="#fff" />
                <View style={styles.optionBody}>
                  <Text style={styles.optionTitle}>Mute video & add music</Text>
                  <Text style={styles.optionSub}>Pick a track from Trending or Your audio</Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          {!busy && (
            <TouchableOpacity style={styles.cancel} onPress={onDismiss}>
              <Text style={styles.cancelText}>Decide later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#161616',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  optionBody: { flex: 1 },
  optionTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  optionSub: { color: '#888', fontSize: 12, marginTop: 4, lineHeight: 17 },
  cancel: { alignItems: 'center', marginTop: 14, paddingVertical: 8 },
  cancelText: { color: REEL_ACCENT, fontWeight: '600' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20 },
  busyText: { color: '#ccc', fontSize: 14 },
});
