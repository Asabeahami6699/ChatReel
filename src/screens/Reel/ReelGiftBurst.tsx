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

export function ReelGiftBurst({ burst, onDone }: Props) {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    if (!burst) return;
    scale.setValue(0.3);
    opacity.setValue(0);
    translateY.setValue(40);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
      Animated.delay(900),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -30, duration: 350, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [burst, onDone, opacity, scale, translateY]);

  if (!burst) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity,
            transform: [{ scale }, { translateY }],
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
