import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReelPlaybackGate } from '../../hooks/useReelPlaybackGate';
import { ReelWalletPanel } from './ReelWalletPanel';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ReelWalletSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  useReelPlaybackGate('wallet-sheet', visible);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={() => undefined}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Creator wallet</Text>
          <ReelWalletPanel />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    marginBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
});
