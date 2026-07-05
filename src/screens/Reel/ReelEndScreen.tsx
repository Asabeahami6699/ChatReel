import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text } from 'react-native';
import { USE_NATIVE_DRIVER } from '../../lib/animation';
import { APP_NAME, REEL_END_SCREEN_MS } from './reelTheme';

const APP_LOGO = require('../../../assets/favIconChat.png');

const ENTER_MS = 550;
const EXIT_MS = 550;

type Props = {
  ownerName?: string;
  durationMs?: number;
};

/** Shown when a reel finishes — animates in, holds, then animates out. */
export function ReelEndScreen({ ownerName, durationMs = REEL_END_SCREEN_MS }: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.78)).current;
  const slideY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    overlayOpacity.setValue(0);
    cardOpacity.setValue(0);
    scale.setValue(0.78);
    slideY.setValue(28);

    const holdMs = Math.max(0, durationMs - ENTER_MS - EXIT_MS);

    const enter = Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 88,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(slideY, {
        toValue: 0,
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);

    const exit = Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(scale, {
        toValue: 0.88,
        duration: EXIT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(slideY, {
        toValue: -18,
        duration: EXIT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);

    const seq = Animated.sequence([enter, Animated.delay(holdMs), exit]);
    seq.start();
    return () => seq.stop();
  }, [cardOpacity, durationMs, overlayOpacity, ownerName, scale, slideY]);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardOpacity,
            transform: [{ scale }, { translateY: slideY }],
          },
        ]}
      >
        <Image source={APP_LOGO} style={styles.logo} />
        <Text style={styles.appName}>{APP_NAME}</Text>
        {ownerName ? (
          <Text style={styles.owner} numberOfLines={1}>
            @{ownerName}
          </Text>
        ) : null}
        <Text style={styles.hint}>Thanks for watching</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  card: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    maxWidth: '80%',
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginBottom: 12,
  },
  appName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  owner: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 14,
    fontWeight: '500',
  },
});
