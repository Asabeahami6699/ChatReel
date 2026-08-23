import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  keyboardAvoidingBehavior,
  keyboardAvoidingEnabled,
  keyboardPaddingAboveSafeArea,
  keyboardVerticalOffset,
  useKeyboardBottomInset,
} from '../../lib/keyboardLayout';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../hooks/useAuth';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';
import {
  UNDERAGE_SIGNUP_MESSAGE,
  defaultBirthdayPickerDate,
  isOldEnoughToSignUp,
  maxBirthdayPickerDate,
  minBirthdayPickerDate,
  toDateOnlyString,
} from '../../lib/ageGate';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'AgeGate'>;

export default function AgeGateScreen() {
  const navigation = useNavigation<Nav>();
  const { enterGuest } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width > 700;
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardBottomInset();
  const scrollPad = keyboardPaddingAboveSafeArea(keyboardInset, insets.bottom) + 24;
  const kavOffset = keyboardVerticalOffset(insets.top);

  const [birthday, setBirthday] = useState(() => defaultBirthdayPickerDate());
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [blocked, setBlocked] = useState(false);

  const label = useMemo(
    () =>
      birthday.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [birthday]
  );

  const onChange = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'dismissed') return;
    }
    if (picked) {
      setBirthday(picked);
      setBlocked(false);
    }
  };

  const onContinue = () => {
    if (!isOldEnoughToSignUp(birthday)) {
      setBlocked(true);
      return;
    }
    navigation.navigate('Register', { dateOfBirth: toDateOnlyString(birthday) });
  };

  const form = (
    <View style={[styles.card, isDesktop && styles.desktopCard]}>
      <Text style={styles.title}>When's your birthday?</Text>
      <Text style={styles.subtitle}>
        We use this to keep ChatReel safe. You won't see this again.
      </Text>

      {blocked ? (
        <View style={styles.blockedBox}>
          <Text style={styles.blockedText}>{UNDERAGE_SIGNUP_MESSAGE}</Text>
        </View>
      ) : null}

      {Platform.OS === 'web' ? (
        React.createElement('input', {
          type: 'date',
          value: toDateOnlyString(birthday),
          max: toDateOnlyString(maxBirthdayPickerDate()),
          min: toDateOnlyString(minBirthdayPickerDate()),
          onChange: (e: { target: { value: string } }) => {
            const v = e.target?.value;
            if (!v) return;
            const [y, m, d] = v.split('-').map(Number);
            if (!y || !m || !d) return;
            setBirthday(new Date(y, m - 1, d));
            setBlocked(false);
          },
          style: {
            padding: 14,
            borderRadius: 12,
            border: '1px solid #ddd',
            fontSize: 16,
            width: '100%',
            boxSizing: 'border-box' as const,
            marginBottom: 16,
          },
        })
      ) : (
        <>
          {Platform.OS === 'android' ? (
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowPicker(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.dateButtonText}>{label}</Text>
            </TouchableOpacity>
          ) : null}
          {(showPicker || Platform.OS === 'ios') && (
            <DateTimePicker
              value={birthday}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChange}
              maximumDate={maxBirthdayPickerDate()}
              minimumDate={minBirthdayPickerDate()}
              style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
            />
          )}
        </>
      )}

      {!blocked ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={onContinue} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Continue</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.footerAction}>Login</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => enterGuest()} style={styles.guestBtn}>
        <Text style={styles.guestText}>Explore without an account</Text>
      </TouchableOpacity>
    </View>
  );

  if (isDesktop) {
    return <View style={styles.desktopWrap}>{form}</View>;
  }

  const body = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={keyboardAvoidingBehavior()}
      enabled={keyboardAvoidingEnabled()}
      keyboardVerticalOffset={kavOffset}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollPad }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {form}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <LinearGradient colors={['#667eea', '#764ba2']} style={styles.flex}>
      {body}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  desktopWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 24,
  },
  card: {
    marginHorizontal: 24,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  desktopCard: {
    width: '100%',
    maxWidth: 420,
    marginHorizontal: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#1a1a1a',
    textAlign: 'center',
    fontWeight: '600',
  },
  iosPicker: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  blockedBox: {
    backgroundColor: '#FFF3F3',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  blockedText: {
    color: '#C62828',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 22,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    flexWrap: 'wrap',
  },
  footerText: { color: '#666', fontSize: 14 },
  footerAction: { color: '#007AFF', fontSize: 14, fontWeight: '700' },
  guestBtn: { marginTop: 14, alignItems: 'center' },
  guestText: { color: '#888', fontSize: 13 },
});
