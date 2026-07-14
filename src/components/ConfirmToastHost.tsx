import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  answerConfirmToast,
  subscribeConfirmToast,
} from '../lib/confirmToast';

type Pending = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/** Global confirm toast (Cancel / Delete). Uses Modal so it sits above other modals. */
export function ConfirmToastHost() {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    return subscribeConfirmToast((next) => setPending(next));
  }, []);

  return (
    <Modal
      visible={pending != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => answerConfirmToast(false)}
    >
      <View style={styles.root}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => answerConfirmToast(false)}
        />
        <View
          style={[
            styles.toast,
            { bottom: Platform.OS === 'web' ? 24 : Math.max(insets.bottom, 12) + 16 },
          ]}
        >
          <Text style={styles.message} numberOfLines={4}>
            {pending?.message}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => answerConfirmToast(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelText}>{pending?.cancelLabel ?? 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                pending?.destructive === false
                  ? styles.confirmBtnNeutral
                  : styles.confirmBtnDanger,
              ]}
              onPress={() => answerConfirmToast(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmText}>{pending?.confirmLabel ?? 'Delete'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
  },
  message: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#2c2c2e',
  },
  cancelText: { color: '#ddd', fontWeight: '700', fontSize: 13 },
  confirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  confirmBtnDanger: { backgroundColor: '#dc2626' },
  confirmBtnNeutral: { backgroundColor: '#007AFF' },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
