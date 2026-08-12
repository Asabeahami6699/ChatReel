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
import { AppLockPinPad } from './AppLockPinPad';
import { hasAppLockPin, setAppLockPin } from '../lib/appLock';
import { useChatLock } from '../context/ChatLockContext';
import { useChatSettings } from '../context/ChatSettingsContext';
import type { ChatListEntryKind } from '../lib/chatListHidden';

type Props = {
  kind: ChatListEntryKind;
  chatId: string;
  chatName?: string;
  onBack?: () => void;
};

/**
 * Covers a single conversation when Chat Lock is set to specific chats.
 * Full-screen Modal so messages/header stay hidden until unlock.
 * Does not re-engage on app background — only when the Chats tab is left.
 */
export function ChatRoomLockCover({ kind, chatId, chatName, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const { requiresRoomUnlock, unlockChat, unlocking } = useChatLock();
  const needsUnlock = requiresRoomUnlock(kind, chatId);
  const isWeb = Platform.OS === 'web';
  const [pinError, setPinError] = useState<string | null>(null);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [setupDraft, setSetupDraft] = useState<string | null>(null);
  const autoPromptedRef = React.useRef(false);

  useEffect(() => {
    if (!needsUnlock || !isWeb) {
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
  }, [needsUnlock, isWeb, chatId]);

  useEffect(() => {
    if (isWeb || !needsUnlock) return;
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    const t = setTimeout(() => {
      void unlockChat(kind, chatId);
    }, 350);
    return () => clearTimeout(t);
  }, [needsUnlock, isWeb, kind, chatId, unlockChat]);

  useEffect(() => {
    autoPromptedRef.current = false;
    setPinError(null);
    setSetupDraft(null);
  }, [chatId]);

  const title = chatName?.trim() ? `${chatName} is locked` : 'This chat is locked';
  const webSubtitle = needsPinSetup
    ? setupDraft
      ? 'Confirm your new PIN to open this chat.'
      : 'Create a PIN for this browser to unlock locked chats.'
    : 'Enter your PIN to open this conversation.';

  return (
    <Modal
      visible={needsUnlock}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {
        onBack?.();
      }}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.headerBg || theme.listBg || '#0b1220',
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          },
        ]}
        accessibilityViewIsModal
      >
        {onBack ? (
          <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <View style={styles.center}>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={28} color="#fff" />
          </View>
          <Image
            source={require('../../assets/favIconChat.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {isWeb
              ? webSubtitle
              : 'Unlock to read this conversation. Other chats stay available.'}
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
                }
                const ok = await unlockChat(kind, chatId, pin);
                if (!ok) setPinError('Wrong code');
              }}
            />
          ) : (
            <TouchableOpacity
              style={[styles.btn, unlocking && styles.btnDisabled]}
              onPress={() => void unlockChat(kind, chatId)}
              disabled={unlocking}
              activeOpacity={0.85}
            >
              {unlocking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="finger-print-outline" size={22} color="#fff" />
                  <Text style={styles.btnText}>Unlock chat</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  backBtn: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpacer: { height: 40, alignSelf: 'stretch' },
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
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
