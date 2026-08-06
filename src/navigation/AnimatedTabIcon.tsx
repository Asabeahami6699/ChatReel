import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  type ImageSourcePropType,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { USE_NATIVE_DRIVER } from '../lib/animation';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  /** Outline / inactive glyph (ignored when `source` is set) */
  name?: IconName;
  /** Filled glyph when focused (defaults to `name`) */
  focusedName?: IconName;
  /** Custom image icon (e.g. chat bubble asset). Tinted with `color`. */
  source?: ImageSourcePropType;
  color: string;
  focused: boolean;
  size?: number;
};

/**
 * Tab bar icon with a short spring pop when the tab becomes active.
 */
export function AnimatedTabIcon({
  name = 'ellipse-outline',
  focusedName,
  source,
  color,
  focused,
  size = 24,
}: Props) {
  const scale = useRef(new Animated.Value(focused ? 1.08 : 1)).current;
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (focused) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1.14,
          friction: 4,
          tension: 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.sequence([
          Animated.timing(lift, {
            toValue: -4,
            duration: 110,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.spring(lift, {
            toValue: 0,
            friction: 5,
            tension: 200,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(lift, {
          toValue: 0,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    }
  }, [focused, lift, scale]);

  return (
    <Animated.View style={{ transform: [{ translateY: lift }, { scale }] }}>
      {source ? (
        <Image
          source={source}
          style={[
            styles.imageIcon,
            {
              width: size,
              height: size,
              tintColor: color,
              opacity: focused ? 1 : 0.88,
            },
          ]}
          resizeMode="contain"
        />
      ) : (
        <Ionicons
          name={focused ? focusedName ?? name : name}
          size={size}
          color={color}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  imageIcon: {
    // Ensures tint works on Android for template-style PNGs.
  },
});
