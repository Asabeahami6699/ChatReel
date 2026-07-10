import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export type GiftBurstPayload = {
  emoji: string;
  name: string;
  key: string;
};

type Props = {
  burst: GiftBurstPayload | null;
  onDone: () => void;
};

/** Total on-screen time for the gift popup (~5s blink, then fade out). */
const HOLD_MS = 4500;
const FADE_IN_MS = 120;
const FADE_OUT_MS = 280;
const BLINK_MS = 450;

export function ReelGiftBurst({ burst, onDone }: Props) {
  const scale = useRef(new Animated.Value(0.35)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!burst) return;
    scale.setValue(0.35);
    opacity.setValue(0);
    blink.setValue(1);

    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.35, duration: BLINK_MS, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: BLINK_MS, useNativeDriver: true }),
      ])
    );

    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }),
    ]).start(() => {
      blinkLoop.start();
    });

    const doneTimer = setTimeout(() => {
      blinkLoop.stop();
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.15, duration: FADE_OUT_MS, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onDone();
      });
    }, HOLD_MS);

    return () => {
      clearTimeout(doneTimer);
      blinkLoop.stop();
    };
  }, [burst, onDone, opacity, scale, blink]);

  if (!burst) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity: Animated.multiply(opacity, blink),
            transform: [{ scale }],
          },
        ]}
      >
        <Text style={styles.emoji}>{burst.emoji}</Text>
        <Text style={styles.label}>{burst.name}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  emoji: { fontSize: 72, marginBottom: 8 },
  label: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
