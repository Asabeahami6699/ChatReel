import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  answerConfirmToast,
  subscribeConfirmToast,
} from '../lib/confirmToast';
import { useToastLayout } from '../lib/toastLayout';

type Pending = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/** Global confirm toast (Cancel / Delete). Uses Modal so it sits above other modals. */
export function ConfirmToastHost() {
  const { isDesktop, maxWidth, wrapperStyle, textStyle } = useToastLayout();
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
      <View style={styles.root} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => answerConfirmToast(false)}
        />
        <View
          style={[
            styles.toast,
            {
              top: wrapperStyle.top,
              right: wrapperStyle.right,
              left: undefined,
              maxWidth,
              paddingHorizontal: isDesktop ? 12 : 16,
              paddingVertical: isDesktop ? 10 : 14,
              borderRadius: isDesktop ? 12 : 16,
            },
          ]}
        >
          <Text style={[styles.message, textStyle]} numberOfLines={4}>
            {pending?.message}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelBtn, isDesktop && styles.actionBtnCompact]}
              onPress={() => answerConfirmToast(false)}
              activeOpacity={0.85}
            >
              <Text style={[styles.cancelText, isDesktop && styles.actionTextCompact]}>
                {pending?.cancelLabel ?? 'Cancel'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                isDesktop && styles.actionBtnCompact,
                pending?.destructive === false
                  ? styles.confirmBtnNeutral
                  : styles.confirmBtnDanger,
              ]}
              onPress={() => answerConfirmToast(true)}
              activeOpacity={0.85}
            >
              <Text style={[styles.confirmText, isDesktop && styles.actionTextCompact]}>
                {pending?.confirmLabel ?? 'Delete'}
              </Text>
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
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  toast: {
    position: 'absolute',
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
  },
  message: {
    color: '#fff',
    marginBottom: 10,
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
  actionBtnCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionTextCompact: {
    fontSize: 12,
  },
});
