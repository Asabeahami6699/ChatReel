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
  /** Called when the user enters 4–6 digits (auto at 6, or via Unlock at ≥4). */
  onSubmit: (pin: string) => void | Promise<void>;
  light?: boolean;
};

/** Shared 4–6 digit PIN pad for web app lock. */
export function AppLockPinPad({
  title,
  subtitle,
  error,
  busy,
  onSubmit,
  light = false,
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= MOBILE_BREAKPOINT;
  const [pin, setPin] = useState('');

  const submit = useCallback(
    async (code: string) => {
      if (busy) return;
      if (code.length < 4) return;
      await onSubmit(code);
      setPin('');
    },
    [busy, onSubmit]
  );

  const onKey = (key: string) => {
    if (busy) return;
    if (key === '') return;
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => {
      if (p.length >= 6) return p;
      const next = p + key;
      if (next.length === 6) {
        setTimeout(() => void submit(next), 40);
      }
      return next;
    });
  };

  const fg = light ? '#111' : '#fff';
  const muted = light ? '#667085' : 'rgba(255,255,255,0.72)';
  const keyBg = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)';

  return (
    <View style={[styles.wrap, isDesktop && styles.wrapDesktop]}>
      {title ? <Text style={[styles.title, { color: fg }]}>{title}</Text> : null}
      {subtitle ? <Text style={[styles.subtitle, { color: muted }]}>{subtitle}</Text> : null}

      <View style={styles.dots}>
        {Array.from({ length: Math.max(4, pin.length || 4) }).map((_, i) => (
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

      {pin.length >= 4 && pin.length < 6 ? (
        <TouchableOpacity
          style={[styles.unlockBtn, light && styles.unlockBtnLight]}
          onPress={() => void submit(pin)}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={[styles.unlockText, light && styles.unlockTextLight]}>Unlock</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.unlockSpacer} />
      )}
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
  unlockBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  unlockBtnLight: {
    backgroundColor: '#5c6bc0',
    borderColor: '#5c6bc0',
  },
  unlockText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  unlockTextLight: { color: '#fff' },
  unlockSpacer: { height: 44, marginTop: 8 },
});
