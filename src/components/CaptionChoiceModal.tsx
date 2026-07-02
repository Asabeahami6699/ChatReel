import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export type CaptionChoiceResult =
  | { action: 'cancel' }
  | { action: 'keep' }
  | { action: 'clear' }
  | { action: 'custom'; text: string };

type Props = {
  visible: boolean;
  title: string;
  originalCaption?: string | null;
  onClose: () => void;
  onConfirm: (result: CaptionChoiceResult) => void;
};

/** Map UI choice to API caption field: undefined = keep source caption, '' = clear. */
export function captionChoiceToApi(
  result: CaptionChoiceResult
): string | undefined | null {
  if (result.action === 'cancel') return null;
  if (result.action === 'keep') return undefined;
  if (result.action === 'clear') return '';
  return result.text;
}

export function CaptionChoiceModal({
  visible,
  title,
  originalCaption,
  onClose,
  onConfirm,
}: Props) {
  const [custom, setCustom] = useState('');
  const [mode, setMode] = useState<'choose' | 'custom'>('choose');
  const original = originalCaption?.trim();

  useEffect(() => {
    if (visible) {
      setCustom('');
      setMode('choose');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {mode === 'choose' ? (
            <>
              <Text style={styles.hint}>
                {original
                  ? `Original caption: "${original.length > 90 ? `${original.slice(0, 90)}…` : original}"`
                  : 'There is no caption on the original post.'}
              </Text>
              {original ? (
                <TouchableOpacity style={styles.btnPrimary} onPress={() => onConfirm({ action: 'keep' })}>
                  <Text style={styles.btnPrimaryText}>Keep original caption</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.btnPrimary} onPress={() => setMode('custom')}>
                <Text style={styles.btnPrimaryText}>Write a new caption</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => onConfirm({ action: 'clear' })}>
                <Text style={styles.btnSecondaryText}>Post without caption</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={onClose}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Write a caption…"
                placeholderTextColor="#888"
                value={custom}
                onChangeText={setCustom}
                maxLength={2000}
                multiline
                autoFocus
              />
              <TouchableOpacity
                style={[styles.btnPrimary, !custom.trim() && styles.btnDisabled]}
                disabled={!custom.trim()}
                onPress={() => onConfirm({ action: 'custom', text: custom.trim() })}
              >
                <Text style={styles.btnPrimaryText}>Use this caption</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setMode('choose')}>
                <Text style={styles.btnGhostText}>Back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  hint: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  input: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    minHeight: 88,
    textAlignVertical: 'top',
    marginBottom: 4,
  },
  btnPrimary: {
    backgroundColor: '#1e90ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#ddd', fontWeight: '600', fontSize: 15 },
  btnGhost: { paddingVertical: 10, alignItems: 'center' },
  btnGhostText: { color: '#888', fontSize: 14 },
  btnDisabled: { opacity: 0.45 },
});
