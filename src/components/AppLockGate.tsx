import React from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppLock } from '../context/AppLockContext';
import { useChatSettings } from '../context/ChatSettingsContext';

/**
 * Full-screen privacy gate shown while App Lock is engaged.
 */
export function AppLockGate() {
  const insets = useSafeAreaInsets();
  const { locked, unlocking, unlock } = useAppLock();
  const { theme } = useChatSettings();

  if (!locked) return null;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.headerBg || theme.listBg,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
      pointerEvents="auto"
      accessibilityViewIsModal
    >
      <View style={styles.center}>
        <Image
          source={require('../../assets/favIconChat.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: '#fff' }]}>App is locked</Text>
        <Text style={styles.subtitle}>
          App lock covers ChatReel. Unlock with biometrics or your device passcode.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, unlocking && styles.btnDisabled]}
        onPress={() => void unlock()}
        disabled={unlocking}
        activeOpacity={0.85}
      >
        {unlocking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="finger-print-outline" size={22} color="#fff" />
            <Text style={styles.btnText}>Unlock</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  logo: { width: 88, height: 88, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    maxWidth: 300,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    minWidth: 180,
    minHeight: 52,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
