import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOBILE_BREAKPOINT } from '../navigation/navigationUtils';

type Props = {
  securityQuestion: string;
  loading?: boolean;
  onVerify: (pin: string) => Promise<void>;
  onRecover: (answer: string, newPin: string) => Promise<void>;
  onCancel: () => void;
};

export function Account2FAChallenge({
  securityQuestion,
  loading,
  onVerify,
  onRecover,
  onCancel,
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= MOBILE_BREAKPOINT;
  const [mode, setMode] = useState<'pin' | 'recover'>('pin');
  const [pin, setPin] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <View style={[styles.card, isDesktop && styles.cardDesktop]}>
      <View style={styles.iconWrap}>
        <Ionicons name="shield-checkmark" size={28} color="#fff" />
      </View>
      <Text style={styles.title}>Two-step verification</Text>
      <Text style={styles.subtitle}>
        {mode === 'pin'
          ? 'Enter your account secret code to continue on this device.'
          : 'Answer your security question to reset the secret code.'}
      </Text>

      {mode === 'pin' ? (
        <>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="4–6 digit code"
            placeholderTextColor="#9aa3af"
            maxLength={6}
            editable={!busy && !loading}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, (busy || loading) && styles.disabled]}
            disabled={busy || loading || pin.length < 4}
            onPress={() => void run(() => onVerify(pin))}
          >
            {busy || loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Verify & continue</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setMode('recover');
              setError(null);
            }}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>Forgot code?</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.questionLabel}>Security question</Text>
          <Text style={styles.question}>{securityQuestion}</Text>
          <TextInput
            style={styles.input}
            value={answer}
            onChangeText={setAnswer}
            placeholder="Your answer"
            placeholderTextColor="#9aa3af"
            autoCapitalize="none"
            editable={!busy && !loading}
          />
          <TextInput
            style={styles.input}
            value={newPin}
            onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="New 4–6 digit code"
            placeholderTextColor="#9aa3af"
            maxLength={6}
            editable={!busy && !loading}
          />
          <TextInput
            style={styles.input}
            value={confirmPin}
            onChangeText={(t) => setConfirmPin(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="Confirm new code"
            placeholderTextColor="#9aa3af"
            maxLength={6}
            editable={!busy && !loading}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, (busy || loading) && styles.disabled]}
            disabled={busy || loading}
            onPress={() =>
              void run(async () => {
                if (newPin.length < 4) throw new Error('Use a 4–6 digit code.');
                if (newPin !== confirmPin) throw new Error('Codes do not match.');
                await onRecover(answer, newPin);
              })
            }
          >
            {busy || loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Reset & continue</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setMode('pin');
              setError(null);
            }}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>Back to code entry</Text>
          </TouchableOpacity>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} disabled={busy || loading}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardDesktop: {
    maxWidth: 320,
    padding: 16,
    borderRadius: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#5c6bc0',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', color: '#111' },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#667085',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
    color: '#111',
    backgroundColor: '#f9fafb',
  },
  primaryBtn: {
    backgroundColor: '#5c6bc0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.7 },
  linkBtn: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: '#5c6bc0', fontWeight: '700' },
  questionLabel: { fontSize: 12, fontWeight: '700', color: '#98a2b3', marginBottom: 4 },
  question: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 12 },
  error: { color: '#ef4444', textAlign: 'center', marginTop: 8, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', paddingTop: 4 },
  cancelText: { color: '#667085', fontWeight: '600' },
});
