import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

export type FloatingMenuAction = {
  key: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  x: number;
  y: number;
  actions: FloatingMenuAction[];
  onClose: () => void;
};

export function FloatingActionMenu({ visible, x, y, actions, onClose }: Props) {
  const { width } = useWindowDimensions();
  const menuWidth = 168;
  const left = Math.max(12, Math.min(x, width - menuWidth - 12));
  const top = Math.max(80, y);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.menu, { top, left, width: menuWidth }]}>
        {actions.map((action, index) => (
          <TouchableOpacity
            key={action.key}
            style={[styles.row, index < actions.length - 1 && styles.rowBorder]}
            onPress={() => {
              onClose();
              action.onPress();
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.label, action.destructive && styles.destructive]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  destructive: {
    color: '#dc2626',
  },
});
