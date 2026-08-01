import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatLock } from '../context/ChatLockContext';
import { useChatSettings } from '../context/ChatSettingsContext';

/**
 * Privacy gate for the Chats tab only (not Reels / Explore / Calls).
 * Mount inside the Chats stack so useIsFocused tracks tab focus.
 */
export function ChatLockGate() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { locked, unlocking, unlock, onChatsBlur } = useChatLock();
  const { theme } = useChatSettings();
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    if (!isFocused) {
      onChatsBlur();
      autoPromptedRef.current = false;
    }
  }, [isFocused, onChatsBlur]);

  // Only prompt while the Chats tab is actually visible.
  useEffect(() => {
    if (!locked || !isFocused) return;
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    const t = setTimeout(() => {
      void unlock();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, isFocused]);

  if (!locked || !isFocused) return null;

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
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={28} color="#fff" />
        </View>
        <Image
          source={require('../../assets/favIconChat.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Chats are locked</Text>
        <Text style={styles.subtitle}>
          Unlock to open your conversations. Reels and other tabs stay available.
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
            <Text style={styles.btnText}>Unlock chats</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 9000,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  lockBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logo: { width: 72, height: 72, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', color: '#fff' },
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
