import React, { useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppLock } from '../context/AppLockContext';
import { useChatSettings } from '../context/ChatSettingsContext';
import { AppLockPinPad } from './AppLockPinPad';
import { getAppLockPinLength, hasAppLockPin, setAppLockPin } from '../lib/appLock';

/**
 * Full-screen privacy gate shown while App Lock is engaged.
 * Uses Modal so the entire app stays covered (not just a partial overlay).
 */
export function AppLockGate() {
  const insets = useSafeAreaInsets();
  const { locked, unlocking, unlock } = useAppLock();
  const { theme } = useChatSettings();
  const [pinError, setPinError] = useState<string | null>(null);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [setupDraft, setSetupDraft] = useState<string | null>(null);
  const [pinLength, setPinLength] = useState<number | null>(null);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (!locked || !isWeb) {
      setNeedsPinSetup(false);
      setSetupDraft(null);
      setPinError(null);
      setPinLength(null);
      return;
    }
    let alive = true;
    void (async () => {
      const has = await hasAppLockPin();
      if (!alive) return;
      setNeedsPinSetup(!has);
      if (has) setPinLength(await getAppLockPinLength());
    })();
    return () => {
      alive = false;
    };
  }, [locked, isWeb]);

  const padLength = needsPinSetup ? (setupDraft ? setupDraft.length : 4) : pinLength;

  const webSubtitle = needsPinSetup
    ? setupDraft
      ? 'Confirm your new PIN to unlock.'
      : 'App lock is on for your account. Create a PIN for this browser.'
    : 'Enter your app lock PIN to continue.';

  return (
    <Modal
      visible={locked}
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
            {isWeb
              ? webSubtitle
              : 'App lock covers ChatReel. Unlock with biometrics or your device passcode.'}
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
              pinLength={padLength}
              onSubmit={async (pin) => {
                setPinError(null);
                if (needsPinSetup) {
                  if (!setupDraft) {
                    setSetupDraft(pin);
                    return true;
                  }
                  if (pin !== setupDraft) {
                    setPinError('Codes do not match. Try again.');
                    setSetupDraft(null);
                    return false;
                  }
                  const result = await setAppLockPin(pin);
                  if (!result.ok) {
                    setPinError(result.error);
                    setSetupDraft(null);
                    return false;
                  }
                  setNeedsPinSetup(false);
                  setSetupDraft(null);
                  setPinLength(pin.length);
                  const ok = await unlock(pin);
                  if (!ok) {
                    setPinError('Could not unlock');
                    return false;
                  }
                  return true;
                }
                const ok = await unlock(pin);
                if (!ok) {
                  const max = padLength ?? 6;
                  if (pin.length >= max) setPinError('Wrong code');
                  return false;
                }
                return true;
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
                <Text style={styles.btnText}>Unlock</Text>
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
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  logo: { width: 88, height: 88, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 8,
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
