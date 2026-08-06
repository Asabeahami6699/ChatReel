import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
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
import { AppLockPinPad } from './AppLockPinPad';
import { hasAppLockPin, setAppLockPin } from '../lib/appLock';

/**
 * Privacy gate for the Chats tab when Chat Lock scope is "all chats".
 * Covers list + conversations. Re-locks only when leaving the Chats *tab*
 * — never on app background (that is App Lock).
 */
export function ChatLockGate() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  // Parent is the main tab navigator; fall back if already at tab level.
  const tabNav = navigation.getParent() ?? navigation;
  const { locked, unlocking, unlock, onChatsBlur, scope } = useChatLock();
  const { theme } = useChatSettings();
  const autoPromptedRef = useRef(false);
  const [tabFocused, setTabFocused] = useState(true);
  const [pinError, setPinError] = useState<string | null>(null);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [setupDraft, setSetupDraft] = useState<string | null>(null);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    const onFocus = () => setTabFocused(true);
    const onBlur = () => {
      setTabFocused(false);
      onChatsBlur();
      autoPromptedRef.current = false;
      setPinError(null);
      setSetupDraft(null);
    };
    const unsubFocus = tabNav.addListener('focus', onFocus);
    const unsubBlur = tabNav.addListener('blur', onBlur);
    return () => {
      unsubFocus();
      unsubBlur();
    };
  }, [tabNav, onChatsBlur]);

  useEffect(() => {
    if (isWeb) return;
    if (!locked || !tabFocused) return;
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    const t = setTimeout(() => {
      void unlock();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, tabFocused, isWeb]);

  const visible = Boolean(scope === 'all' && locked && tabFocused);

  useEffect(() => {
    if (!visible || !isWeb) {
      setNeedsPinSetup(false);
      setSetupDraft(null);
      return;
    }
    let alive = true;
    void hasAppLockPin().then((has) => {
      if (alive) setNeedsPinSetup(!has);
    });
    return () => {
      alive = false;
    };
  }, [visible, isWeb]);

  const webSubtitle = needsPinSetup
    ? setupDraft
      ? 'Confirm your new PIN to unlock chats.'
      : 'Chat lock is on for your account. Create a PIN for this browser.'
    : 'Enter your PIN to open Chats.';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {
        /* must unlock via biometric / PIN */
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
            {isWeb
              ? webSubtitle
              : 'Unlock to open conversations. Leaving ChatReel does not re-lock — use App lock for that.'}
          </Text>

          {isWeb ? (
            <AppLockPinPad
              title={
                needsPinSetup
                  ? setupDraft
                    ? 'Confirm PIN'
                    : 'Create PIN'
                  : undefined
              }
              error={pinError}
              busy={unlocking}
              onSubmit={async (pin) => {
                setPinError(null);
                if (needsPinSetup) {
                  if (!setupDraft) {
                    setSetupDraft(pin);
                    return;
                  }
                  if (pin !== setupDraft) {
                    setPinError('Codes do not match. Try again.');
                    setSetupDraft(null);
                    return;
                  }
                  const result = await setAppLockPin(pin);
                  if (!result.ok) {
                    setPinError(result.error);
                    setSetupDraft(null);
                    return;
                  }
                  setNeedsPinSetup(false);
                  setSetupDraft(null);
                  const ok = await unlock(pin);
                  if (!ok) setPinError('Could not unlock');
                  return;
                }
                const ok = await unlock(pin);
                if (!ok) setPinError('Wrong code');
              }}
            />
          ) : null}
        </View>

        {!isWeb ? (
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
        ) : null}
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
    width: '100%',
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
