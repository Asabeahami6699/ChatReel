import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatLock } from '../context/ChatLockContext';
import { useChatSettings } from '../context/ChatSettingsContext';

/**
 * Privacy gate for the Chats tab only (not Reels / Explore / Calls).
 * Covers the entire Chats stack (list + room) with a full-screen modal.
 * Re-locks only when leaving the Chats *tab* — never on ChatRoom push.
 */
export function ChatLockGate() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  // Parent is the main tab navigator; fall back if already at tab level.
  const tabNav = navigation.getParent() ?? navigation;
  const { locked, unlocking, unlock, onChatsBlur } = useChatLock();
  const { theme } = useChatSettings();
  const autoPromptedRef = useRef(false);
  const [tabFocused, setTabFocused] = useState(true);

  useEffect(() => {
    const onFocus = () => setTabFocused(true);
    const onBlur = () => {
      setTabFocused(false);
      onChatsBlur();
      autoPromptedRef.current = false;
    };
    const unsubFocus = tabNav.addListener('focus', onFocus);
    const unsubBlur = tabNav.addListener('blur', onBlur);
    return () => {
      unsubFocus();
      unsubBlur();
    };
  }, [tabNav, onChatsBlur]);

  useEffect(() => {
    if (!locked || !tabFocused) return;
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    const t = setTimeout(() => {
      void unlock();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, tabFocused]);

  const visible = Boolean(locked && tabFocused);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {
        /* must unlock via biometric / button */
      }}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.headerBg || theme.listBg || '#0b1220',
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
