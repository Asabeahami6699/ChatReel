import React, { useCallback, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { MOBILE_BREAKPOINT } from '../navigation/navigationUtils';

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

type Props = {
  title?: string;
  subtitle?: string;
  error?: string | null;
  busy?: boolean;
  /**
   * When set, auto-submits at this length (no Unlock button).
   * When omitted, auto-tries from 4 digits up to 6 (for legacy unlock / setup).
   */
  pinLength?: number | null;
  /**
   * Return `false` when the code is wrong so the pad can keep accepting digits
   * until max length. Return true/void on success.
   */
  onSubmit: (pin: string) => void | boolean | Promise<void | boolean>;
  light?: boolean;
};

/** Shared 4–6 digit PIN pad for web app/chat lock — auto-submits, no manual Unlock. */
export function AppLockPinPad({
  title,
  subtitle,
  error,
  busy,
  pinLength,
  onSubmit,
  light = false,
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= MOBILE_BREAKPOINT;
  const [pin, setPin] = useState('');
  const maxLen = pinLength && pinLength >= 4 && pinLength <= 6 ? pinLength : 6;
  const autoAt = pinLength && pinLength >= 4 && pinLength <= 6 ? pinLength : null;

  const submit = useCallback(
    async (code: string) => {
      if (busy) return;
      if (code.length < 4) return;
      const result = await onSubmit(code);
      const ok = result !== false;
      if (ok) {
        setPin('');
        return;
      }
      // Wrong code: keep digits if user may still be typing a longer PIN.
      if (code.length >= maxLen) {
        setPin('');
      }
    },
    [busy, onSubmit, maxLen]
  );

  const onKey = (key: string) => {
    if (busy) return;
    if (key === '') return;
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => {
      if (p.length >= maxLen) return p;
      const next = p + key;
      const shouldAuto =
        autoAt != null ? next.length === autoAt : next.length >= 4 && next.length <= 6;
      if (shouldAuto) {
        setTimeout(() => void submit(next), 40);
      }
      return next;
    });
  };

  const fg = light ? '#111' : '#fff';
  const muted = light ? '#667085' : 'rgba(255,255,255,0.72)';
  const keyBg = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)';
  const dotCount = Math.max(autoAt ?? 4, pin.length || 4, 4);

  return (
    <View style={[styles.wrap, isDesktop && styles.wrapDesktop]}>
      {title ? <Text style={[styles.title, { color: fg }]}>{title}</Text> : null}
      {subtitle ? <Text style={[styles.subtitle, { color: muted }]}>{subtitle}</Text> : null}

      <View style={styles.dots}>
        {Array.from({ length: Math.min(dotCount, maxLen) }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < pin.length ? (light ? '#5c6bc0' : '#fff') : 'transparent',
                borderColor: light ? '#c5cae9' : 'rgba(255,255,255,0.45)',
              },
            ]}
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.pad}>
        {PAD.map((key, index) => (
          <TouchableOpacity
            key={`${key}-${index}`}
            style={[
              styles.key,
              { backgroundColor: key === '' ? 'transparent' : keyBg },
              isDesktop && styles.keyDesktop,
            ]}
            disabled={key === '' || busy}
            onPress={() => onKey(key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.keyText, { color: fg }, isDesktop && styles.keyTextDesktop]}>
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  wrapDesktop: {
    maxWidth: 300,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 14,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  error: {
    color: '#ef5350',
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  key: {
    width: '30%',
    maxWidth: 96,
    aspectRatio: 1.55,
    margin: '1.5%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDesktop: {
    maxWidth: 78,
    aspectRatio: 1.45,
  },
  keyText: { fontSize: 22, fontWeight: '700' },
  keyTextDesktop: { fontSize: 18 },
});
