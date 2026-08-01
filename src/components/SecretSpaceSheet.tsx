import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatListAvatar } from './ChatListAvatar';
import { useChatSettings } from '../context/ChatSettingsContext';
import {
  clearVaultPin,
  hasVaultPin,
  loadVaultEntries,
  setVaultPin,
  unhideChatFromVault,
  verifyVaultPin,
  type VaultChatEntry,
} from '../lib/chatVault';
import type { ChatListEntryKind } from '../lib/chatListHidden';
import { api } from '../lib/api';

type Mode = 'setup' | 'confirm' | 'unlock' | 'list' | 'recover';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** When opening to hide a chat before a PIN exists. */
  pendingHide?: {
    kind: ChatListEntryKind;
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null;
  onSetupComplete?: (pin: string) => void;
  onOpenChat: (entry: VaultChatEntry) => void;
  onEntriesChanged: (entries: VaultChatEntry[]) => void;
  /** Pre-verified unlock (e.g. search-bar code). */
  preUnlocked?: boolean;
};

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export function SecretSpaceSheet({
  visible,
  onClose,
  pendingHide,
  onSetupComplete,
  onOpenChat,
  onEntriesChanged,
  preUnlocked = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const [mode, setMode] = useState<Mode>('unlock');
  const [pin, setPin] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<VaultChatEntry[]>([]);
  const [recoverAnswer, setRecoverAnswer] = useState('');
  const [recoverQuestion, setRecoverQuestion] = useState<string | null>(null);
  const [recoverBusy, setRecoverBusy] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  const reset = useCallback(async () => {
    setPin('');
    setSetupPin('');
    setError(null);
    const has = await hasVaultPin();
    // Hiding a chat with no code yet → create one first.
    if (!has) {
      setMode('setup');
      return;
    }
    if (preUnlocked) {
      const list = await loadVaultEntries();
      setEntries(list);
      setMode('list');
      return;
    }
    setMode('unlock');
  }, [preUnlocked]);

  useEffect(() => {
    if (!visible) return;
    void reset();
  }, [visible, reset]);

  const shakeError = useCallback(
    (msg: string) => {
      setError(msg);
      shake.setValue(0);
      Animated.sequence([
        Animated.timing(shake, { toValue: 10, duration: 40, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -10, duration: 40, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 8, duration: 40, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -8, duration: 40, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 40, useNativeDriver: true }),
      ]).start();
    },
    [shake]
  );

  const goToList = useCallback(async () => {
    const list = await loadVaultEntries();
    setEntries(list);
    setMode('list');
    setPin('');
    setError(null);
  }, []);

  const submitUnlock = useCallback(
    async (code: string) => {
      const ok = await verifyVaultPin(code);
      if (!ok) {
        setPin('');
        shakeError('Wrong code');
        return;
      }
      await goToList();
    },
    [goToList, shakeError]
  );

  const submitSetup = useCallback(
    async (code: string) => {
      if (mode === 'setup') {
        setSetupPin(code);
        setPin('');
        setMode('confirm');
        setError(null);
        return;
      }
      if (code !== setupPin) {
        setPin('');
        setSetupPin('');
        setMode('setup');
        shakeError('Codes did not match — try again');
        return;
      }
      const result = await setVaultPin(code);
      if (!result.ok) {
        shakeError(result.error);
        return;
      }
      if (pendingHide && onSetupComplete) {
        onSetupComplete(code);
        onClose();
        return;
      }
      await goToList();
    },
    [goToList, mode, onClose, onSetupComplete, pendingHide, setupPin, shakeError]
  );

  const onDigit = useCallback(
    (d: string) => {
      if (d === '') return;
      if (d === '⌫') {
        setPin((p) => p.slice(0, -1));
        setError(null);
        return;
      }
      setPin((prev) => {
        if (prev.length >= 6) return prev;
        const next = prev + d;
        if (next.length >= 4) {
          // Auto-submit at 4+ when user taps a 5th/6th or after short delay via effect
        }
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (!visible) return;
    if (mode !== 'unlock' && mode !== 'setup' && mode !== 'confirm') return;
    if (pin.length < 4) return;
    const t = setTimeout(() => {
      if (mode === 'unlock') void submitUnlock(pin);
      else void submitSetup(pin);
    }, pin.length >= 6 ? 80 : 420);
    return () => clearTimeout(t);
  }, [pin, mode, visible, submitUnlock, submitSetup]);

  const title = useMemo(() => {
    if (mode === 'setup') return pendingHide ? 'Create a Secret code' : 'Set Secret code';
    if (mode === 'confirm') return 'Confirm your code';
    if (mode === 'recover') return 'Reset Secret code';
    if (mode === 'list') return 'Secret Space';
    return 'Secret Space';
  }, [mode, pendingHide]);

  const subtitle = useMemo(() => {
    if (mode === 'setup') {
      return pendingHide
        ? `Hide “${pendingHide.name}” behind a 4–6 digit code. Long-press the ChatReel logo anytime to open this space.`
        : 'Choose a 4–6 digit code to open hidden chats.';
    }
    if (mode === 'confirm') return 'Enter the same code once more.';
    if (mode === 'recover') {
      return recoverQuestion
        ? 'Answer your account security question, then choose a new Secret code.'
        : 'Uses the same security question as Two-step verification.';
    }
    if (mode === 'list') {
      return entries.length
        ? 'Hidden chats stay off your list until you unhide them.'
        : 'No hidden chats yet. Long-press a chat → Hide.';
    }
    return 'Enter your Secret code — or type it in search.';
  }, [mode, pendingHide, entries.length, recoverQuestion]);

  const startRecover = useCallback(async () => {
    setError(null);
    setRecoverBusy(true);
    try {
      const status = await api.account2fa.status();
      if (!status.enabled || !status.security_question) {
        setError('Turn on Two-step verification in Settings to recover this code.');
        return;
      }
      setRecoverQuestion(status.security_question);
      setRecoverAnswer('');
      setPin('');
      setMode('recover');
    } catch {
      setError('Could not load recovery question. Check your connection.');
    } finally {
      setRecoverBusy(false);
    }
  }, []);

  const submitRecover = useCallback(async () => {
    if (recoverBusy) return;
    setRecoverBusy(true);
    setError(null);
    try {
      await api.account2fa.verifyAnswer(recoverAnswer);
      if (pin.length < 4) {
        setError('Choose a new 4–6 digit code below, then tap Reset.');
        return;
      }
      await clearVaultPin();
      const result = await setVaultPin(pin);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await goToList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recovery failed');
    } finally {
      setRecoverBusy(false);
    }
  }, [goToList, pin, recoverAnswer, recoverBusy]);

  const handleUnhide = async (entry: VaultChatEntry) => {
    const next = await unhideChatFromVault(entry.kind, entry.id);
    setEntries(next);
    onEntriesChanged(next);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.listCardBg || theme.listBg,
              borderColor: theme.listBorder,
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="eye-off" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.listPrimaryText }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>{subtitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={theme.listSecondaryText} />
            </TouchableOpacity>
          </View>

          {mode === 'list' ? (
            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 16 }}>
              {entries.map((entry) => (
                <View
                  key={`${entry.kind}:${entry.id}`}
                  style={[styles.row, { borderBottomColor: theme.listBorder }]}
                >
                  <TouchableOpacity
                    style={styles.rowMain}
                    onPress={() => {
                      onOpenChat(entry);
                      onClose();
                    }}
                    activeOpacity={0.75}
                  >
                    <ChatListAvatar uri={entry.avatarUrl} name={entry.name} size={44} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.rowName, { color: theme.listPrimaryText }]} numberOfLines={1}>
                        {entry.name}
                      </Text>
                      <Text style={{ color: theme.listSecondaryText, fontSize: 12 }}>
                        {entry.kind === 'group' ? 'Group · hidden' : 'Chat · hidden'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.listSecondaryText} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.unhideBtn}
                    onPress={() => void handleUnhide(entry)}
                  >
                    <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>Unhide</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : mode === 'recover' ? (
            <View>
              {recoverQuestion ? (
                <Text style={[styles.recoverQ, { color: theme.listPrimaryText }]}>
                  {recoverQuestion}
                </Text>
              ) : null}
              <TextInput
                style={[
                  styles.recoverInput,
                  { color: theme.listPrimaryText, borderColor: theme.listBorder },
                ]}
                value={recoverAnswer}
                onChangeText={setRecoverAnswer}
                placeholder="Your answer"
                placeholderTextColor={theme.listSecondaryText}
                autoCapitalize="none"
              />
              <Text style={{ color: theme.listSecondaryText, marginBottom: 6, fontWeight: '700' }}>
                New Secret code
              </Text>
              <TextInput
                style={[
                  styles.recoverInput,
                  { color: theme.listPrimaryText, borderColor: theme.listBorder },
                ]}
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                placeholder="4–6 digits"
                placeholderTextColor={theme.listSecondaryText}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.recoverBtn, { backgroundColor: theme.primary }]}
                disabled={recoverBusy}
                onPress={() => void submitRecover()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {recoverBusy ? 'Working…' : 'Reset code'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.forgotLink} onPress={() => setMode('unlock')}>
                <Text style={{ color: theme.listSecondaryText }}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Animated.View style={{ transform: [{ translateX: shake }] }}>
              <View style={styles.dots}>
                {Array.from({ length: Math.max(4, pin.length || 4) }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          i < pin.length ? theme.primary : theme.isDark ? '#333' : '#dde3ea',
                      },
                    ]}
                  />
                ))}
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {/* Hidden input helps password managers / accessibility */}
              <TextInput
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                style={styles.hiddenInput}
                maxLength={6}
                autoFocus={false}
              />
              <View style={styles.pad}>
                {PAD.map((d, idx) => (
                  <TouchableOpacity
                    key={`${d}-${idx}`}
                    style={[styles.key, !d && styles.keyEmpty]}
                    disabled={!d}
                    onPress={() => onDigit(d)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.keyText, { color: theme.listPrimaryText }]}>
                      {d === '⌫' ? '⌫' : d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {mode === 'unlock' ? (
                <TouchableOpacity
                  style={styles.forgotLink}
                  disabled={recoverBusy}
                  onPress={() => void startRecover()}
                >
                  <Text style={{ color: theme.primary, fontWeight: '700' }}>Forgot code?</Text>
                </TouchableOpacity>
              ) : null}
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  sheet: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(127,127,127,0.35)',
    marginBottom: 10,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#5c6bc0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 18,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  error: { color: '#ef5350', textAlign: 'center', marginBottom: 8, fontWeight: '600' },
  hiddenInput: { height: 0, opacity: 0, position: 'absolute' },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 8,
  },
  key: {
    width: '30%',
    maxWidth: 96,
    aspectRatio: 1.6,
    margin: '1.5%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { fontSize: 22, fontWeight: '700' },
  list: { maxHeight: 420 },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center' },
  rowName: { fontSize: 16, fontWeight: '700' },
  unhideBtn: { alignSelf: 'flex-end', paddingTop: 6, paddingHorizontal: 4 },
  forgotLink: { alignItems: 'center', paddingVertical: 14 },
  recoverQ: { fontSize: 15, fontWeight: '700', marginBottom: 10, lineHeight: 21 },
  recoverInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    fontSize: 16,
  },
  recoverBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
});
