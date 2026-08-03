import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import {
  getCached2faStatus,
  prefetch2faStatus,
  setCached2faStatus,
} from '../lib/account2faCache';
import { useChatSettings } from '../context/ChatSettingsContext';
import { showAppToast } from '../lib/appToast';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const SUGGESTED_QUESTIONS = [
  'What city were you born in?',
  'What was the name of your first pet?',
  'What is your mother’s maiden name?',
  'What was your childhood nickname?',
];

export function Account2FASetupSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const cached = getCached2faStatus();
  const [loading, setLoading] = useState(!cached);
  const [enabled, setEnabled] = useState(Boolean(cached?.enabled));
  const [questionHint, setQuestionHint] = useState<string | null>(
    cached?.security_question ?? null
  );
  const [mode, setMode] = useState<'status' | 'enable' | 'disable' | 'reset'>('status');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [question, setQuestion] = useState(SUGGESTED_QUESTIONS[0]);
  const [answer, setAnswer] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (showSpinner = true) => {
    if (showSpinner && !getCached2faStatus()) setLoading(true);
    try {
      const res = await prefetch2faStatus(true);
      if (!res) throw new Error('status');
      setEnabled(res.enabled);
      setQuestionHint(res.security_question);
      setMode('status');
    } catch {
      setError('Could not load 2FA status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setPin('');
    setConfirmPin('');
    setAnswer('');
    setNewPin('');
    const warm = getCached2faStatus();
    if (warm) {
      setEnabled(warm.enabled);
      setQuestionHint(warm.security_question);
      setLoading(false);
      void refresh(false);
    } else {
      void refresh(true);
    }
  }, [visible]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingBottom: insets.bottom + 12, paddingTop: insets.top + 12 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.listCardBg, borderColor: theme.listBorder },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="shield-checkmark-outline" size={22} color={theme.primary} />
            <Text style={[styles.title, { color: theme.listPrimaryText }]}>Two-step verification</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.listSecondaryText} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={theme.primary} />
          ) : mode === 'status' ? (
            <>
              <Text style={[styles.body, { color: theme.listSecondaryText }]}>
                {enabled
                  ? 'A secret code is required when you sign in on a new device or after reinstalling the app.'
                  : 'Protect your account with a secret code plus a security question for recovery.'}
              </Text>
              {enabled && questionHint ? (
                <Text style={[styles.hint, { color: theme.listSecondaryText }]}>
                  Recovery question on file: {questionHint}
                </Text>
              ) : null}
              {enabled ? (
                <>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: theme.primary }]}
                    onPress={() => setMode('disable')}
                  >
                    <Text style={styles.btnText}>Turn off</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.link} onPress={() => setMode('reset')}>
                    <Text style={{ color: theme.primary, fontWeight: '700' }}>Forgot code? Reset it</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.primary }]}
                  onPress={() => setMode('enable')}
                >
                  <Text style={styles.btnText}>Set up 2FA</Text>
                </TouchableOpacity>
              )}
            </>
          ) : mode === 'enable' ? (
            <>
              <Text style={[styles.label, { color: theme.listSecondaryText }]}>Secret code (4–6 digits)</Text>
              <TextInput
                style={[styles.input, { color: theme.listPrimaryText, borderColor: theme.listBorder }]}
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                placeholder="••••"
                placeholderTextColor={theme.listSecondaryText}
              />
              <TextInput
                style={[styles.input, { color: theme.listPrimaryText, borderColor: theme.listBorder }]}
                value={confirmPin}
                onChangeText={(t) => setConfirmPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                placeholder="Confirm code"
                placeholderTextColor={theme.listSecondaryText}
              />
              <Text style={[styles.label, { color: theme.listSecondaryText }]}>Security question</Text>
              {SUGGESTED_QUESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.chip,
                    {
                      borderColor: question === q ? theme.primary : theme.listBorder,
                      backgroundColor: question === q ? `${theme.primary}22` : 'transparent',
                    },
                  ]}
                  onPress={() => setQuestion(q)}
                >
                  <Text style={{ color: theme.listPrimaryText, fontSize: 13 }}>{q}</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={[styles.input, { color: theme.listPrimaryText, borderColor: theme.listBorder }]}
                value={answer}
                onChangeText={setAnswer}
                placeholder="Your answer"
                placeholderTextColor={theme.listSecondaryText}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary }, busy && styles.disabled]}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    if (pin.length < 4) throw new Error('Use a 4–6 digit code.');
                    if (pin !== confirmPin) throw new Error('Codes do not match.');
                    if (answer.trim().length < 3) throw new Error('Answer is too short.');
                    await api.account2fa.enable({
                      pin,
                      security_question: question,
                      security_answer: answer,
                    });
                    setCached2faStatus({ enabled: true, security_question: question });
                    showAppToast('Two-step verification is on');
                    await refresh(false);
                  })
                }
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Enable</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.link} onPress={() => setMode('status')}>
                <Text style={{ color: theme.listSecondaryText }}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : mode === 'disable' ? (
            <>
              <Text style={[styles.body, { color: theme.listSecondaryText }]}>
                Enter your secret code to turn off two-step verification.
              </Text>
              <TextInput
                style={[styles.input, { color: theme.listPrimaryText, borderColor: theme.listBorder }]}
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                placeholder="Secret code"
                placeholderTextColor={theme.listSecondaryText}
              />
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#ef5350' }, busy && styles.disabled]}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await api.account2fa.disable(pin);
                    setCached2faStatus({ enabled: false, security_question: null });
                    showAppToast('Two-step verification turned off');
                    await refresh(false);
                  })
                }
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Turn off</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.link} onPress={() => setMode('status')}>
                <Text style={{ color: theme.listSecondaryText }}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.body, { color: theme.listSecondaryText }]}>
                Answer your security question to reset the secret code.
              </Text>
              {questionHint ? (
                <Text style={[styles.hint, { color: theme.listPrimaryText }]}>{questionHint}</Text>
              ) : null}
              <TextInput
                style={[styles.input, { color: theme.listPrimaryText, borderColor: theme.listBorder }]}
                value={answer}
                onChangeText={setAnswer}
                placeholder="Your answer"
                placeholderTextColor={theme.listSecondaryText}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, { color: theme.listPrimaryText, borderColor: theme.listBorder }]}
                value={newPin}
                onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                placeholder="New secret code"
                placeholderTextColor={theme.listSecondaryText}
              />
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary }, busy && styles.disabled]}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    if (newPin.length < 4) throw new Error('Use a 4–6 digit code.');
                    await api.account2fa.reset({
                      security_answer: answer,
                      new_pin: newPin,
                    });
                    showAppToast('Secret code reset');
                    await refresh();
                  })
                }
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Reset code</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.link} onPress={() => setMode('status')}>
                <Text style={{ color: theme.listSecondaryText }}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
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
    padding: 16,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(127,127,127,0.35)',
    marginBottom: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  hint: { fontSize: 13, marginBottom: 12, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    fontSize: 16,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { alignItems: 'center', paddingVertical: 12 },
  disabled: { opacity: 0.7 },
  error: { color: '#ef5350', textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
