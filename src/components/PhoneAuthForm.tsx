import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { normalizePhoneToE164 } from '../lib/phone';
import CountryCodePicker from './CountryCodePicker';

type Mode = 'login' | 'register';

type Props = {
  mode: Mode;
  loading?: boolean;
  footerText: string;
  footerActionText: string;
  onFooterAction: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  tertiaryActionText?: string;
  onTertiaryAction?: () => void;
  noGradient?: boolean;
  onSendCode: (args: {
    phone: string;
    displayName?: string;
  }) => Promise<{ phone: string; phone_masked: string } | { error: string }>;
  onVerifyCode: (args: {
    phone: string;
    token: string;
    displayName?: string;
  }) => Promise<{ error?: string } | void>;
};

function defaultCountryCode(): string {
  const extra = Constants.expoConfig?.extra as { defaultCountryCode?: string } | undefined;
  const fromExtra = extra?.defaultCountryCode;
  const fromEnv = process.env.EXPO_PUBLIC_DEFAULT_COUNTRY_CODE;
  const raw = (fromEnv || fromExtra || '+234').trim();
  return raw.startsWith('+') ? raw : `+${raw}`;
}

export default function PhoneAuthForm({
  mode,
  loading,
  footerText,
  footerActionText,
  onFooterAction,
  secondaryActionText,
  onSecondaryAction,
  tertiaryActionText,
  onTertiaryAction,
  noGradient = false,
  onSendCode,
  onVerifyCode,
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width > 700;
  const countryHint = useMemo(() => defaultCountryCode(), []);
  const [selectedCountryCode, setSelectedCountryCode] = useState(countryHint);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitting = busy || !!loading;

  const validatePhoneField = (text: string) => {
    setPhone(text);
    const normalized = normalizePhoneToE164(text, selectedCountryCode);
    setPhoneError(
      normalized ? '' : `Enter a valid number (e.g. ${selectedCountryCode}8012345678)`
    );
  };

  const changeCountryCode = (countryCode: string) => {
    setSelectedCountryCode(countryCode);
    if (!phone.trim()) {
      setPhoneError('');
      return;
    }
    const normalized = normalizePhoneToE164(phone, countryCode);
    setPhoneError(
      normalized ? '' : `Enter a valid number (e.g. ${countryCode}8012345678)`
    );
  };

  const validateName = (text: string) => {
    setDisplayName(text);
    setNameError(text.trim().length < 2 ? 'Display name must be at least 2 characters' : '');
  };

  const handleSend = async () => {
    if (mode === 'register' && displayName.trim().length < 2) {
      setNameError('Display name must be at least 2 characters');
      return;
    }
    const normalized = normalizePhoneToE164(phone, selectedCountryCode);
    if (!normalized) {
      setPhoneError(`Enter a valid number (e.g. ${selectedCountryCode}8012345678)`);
      return;
    }

    setBusy(true);
    setPhoneError('');
    try {
      const result = await onSendCode({
        phone: normalized,
        displayName: mode === 'register' ? displayName.trim() : undefined,
      });
      if ('error' in result) {
        setPhoneError(result.error);
        return;
      }
      setNormalizedPhone(result.phone);
      setMaskedPhone(result.phone_masked);
      setStep('code');
      setCode('');
      setCodeError('');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    const token = code.trim();
    if (token.length < 4) {
      setCodeError('Enter the verification code from SMS');
      return;
    }
    setBusy(true);
    setCodeError('');
    try {
      const result = await onVerifyCode({
        phone: normalizedPhone || phone,
        token,
        displayName: mode === 'register' ? displayName.trim() : undefined,
      });
      if (result && 'error' in result && result.error) {
        setCodeError(result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const formContent = (
    <View style={[styles.formContainer, isDesktop && styles.desktopCard]}>
      <Text style={styles.title}>{mode === 'login' ? 'Login' : 'Create Account'}</Text>
      <Text style={styles.subtitle}>
        {step === 'phone'
          ? 'Use your phone number — one number, one account.'
          : `Enter the code sent to ${maskedPhone || 'your phone'}.`}
      </Text>

      {step === 'phone' ? (
        <>
          {mode === 'register' ? (
            <>
              <TextInput
                placeholder="Display name"
                value={displayName}
                onChangeText={validateName}
                style={[styles.input, nameError ? styles.inputError : undefined]}
                autoCapitalize="words"
              />
              {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
            </>
          ) : null}

          <View style={[styles.phoneRow, phoneError ? styles.inputError : undefined]}>
            <CountryCodePicker
              value={selectedCountryCode}
              onChange={changeCountryCode}
            />
            <TextInput
              placeholder="Phone number"
              value={phone}
              onChangeText={validatePhoneField}
              style={[styles.input, styles.phoneInput]}
              keyboardType="phone-pad"
              autoCapitalize="none"
              textContentType="telephoneNumber"
            />
          </View>
          <Text style={styles.phoneHelp}>
            You can enter a local number starting with 0, or a complete number starting with +.
          </Text>
          {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}

          <TouchableOpacity
            style={[
              styles.button,
              (submitting || !!phoneError || !!nameError) && { opacity: 0.7 },
            ]}
            onPress={() => void handleSend()}
            disabled={submitting || !!phoneError || !!nameError}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send code</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            placeholder="6-digit code"
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\D/g, '').slice(0, 8));
              setCodeError('');
            }}
            style={[styles.input, codeError ? styles.inputError : undefined]}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoFocus
          />
          {codeError ? <Text style={styles.errorText}>{codeError}</Text> : null}

          <TouchableOpacity
            style={[styles.button, submitting && { opacity: 0.7 }]}
            onPress={() => void handleVerify()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'login' ? 'Verify & login' : 'Verify & create account'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => {
              setStep('phone');
              setCode('');
              setCodeError('');
            }}
            disabled={submitting}
          >
            <Text style={styles.linkText}>Change phone number</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => void handleSend()}
            disabled={submitting}
          >
            <Text style={styles.linkText}>Resend code</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>{footerText}</Text>
        <TouchableOpacity onPress={onFooterAction}>
          <Text style={styles.footerLink}>{footerActionText}</Text>
        </TouchableOpacity>
      </View>

      {tertiaryActionText && onTertiaryAction ? (
        <TouchableOpacity style={styles.secondaryAction} onPress={onTertiaryAction}>
          <Text style={styles.secondaryActionText}>{tertiaryActionText}</Text>
        </TouchableOpacity>
      ) : null}

      {secondaryActionText && onSecondaryAction ? (
        <TouchableOpacity style={styles.secondaryAction} onPress={onSecondaryAction}>
          <Text style={styles.secondaryActionText}>{secondaryActionText}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (noGradient) {
    return (
      <KeyboardAvoidingView
        style={[styles.safeContainer, isDesktop && styles.desktopContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {formContent}
      </KeyboardAvoidingView>
    );
  }

  return (
    <LinearGradient colors={['#E3F2FD', '#BBDEFB', '#90CAF9']} style={styles.gradientBackground}>
      <KeyboardAvoidingView
        style={[styles.safeContainer, isDesktop && styles.desktopContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {formContent}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBackground: { flex: 1 },
  safeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  desktopContainer: { justifyContent: 'center' },
  formContainer: { width: '100%', maxWidth: 420 },
  desktopCard: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    color: '#222',
  },
  subtitle: {
    textAlign: 'center',
    color: '#555',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 28,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fafafa',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fafafa',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  phoneInput: {
    flex: 1,
    height: 52,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    marginBottom: 0,
  },
  phoneHelp: {
    color: '#666',
    fontSize: 12,
    lineHeight: 17,
    marginTop: -3,
    marginBottom: 9,
    marginLeft: 2,
  },
  inputError: { borderColor: '#e63946' },
  errorText: {
    color: '#e63946',
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  linkBtn: {
    alignItems: 'center',
    marginTop: 14,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
  },
  footerText: { color: '#555', fontSize: 15 },
  footerLink: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  secondaryAction: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryActionText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
