import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { USE_NATIVE_DRIVER } from '../lib/animation';

type Props = {
  uri?: string | null;
  style?: StyleProp<ViewStyle | ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  onError?: () => void;
  /** Fallback when uri is missing or fails. */
  fallback?: React.ReactNode;
};

/**
 * Soft blur/placeholder while decoding — avoids black tile + progressive JPEG
 * left-to-right paint. Sharp image fades in once loaded.
 */
export function SoftFadeImage({
  uri,
  style,
  resizeMode = 'cover',
  onError,
  fallback,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    opacity.setValue(0);
    setFailed(false);
    setLoaded(false);
  }, [uri, opacity]);

  if (!uri || failed) {
    return (
      <View style={[styles.fill, styles.placeholder, style]}>
        {fallback ?? null}
      </View>
    );
  }

  return (
    <View style={[styles.fill, styles.placeholder, style]}>
      {/* Soft stand-in: blurred copy on web, muted fill on native until load. */}
      {Platform.OS === 'web' && !loaded ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, styles.blurStandIn as ImageStyle]}
          resizeMode={resizeMode}
          // @ts-expect-error web CSS filter
          fadeDuration={0}
        />
      ) : null}
      <Animated.Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity }]}
        resizeMode={resizeMode}
        onLoad={() => {
          setLoaded(true);
          Animated.timing(opacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start();
        }}
        onError={() => {
          setFailed(true);
          onError?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { overflow: 'hidden' },
  placeholder: { backgroundColor: '#2a2a2a' },
  blurStandIn: {
    // @ts-expect-error web-only
    filter: 'blur(18px)',
    transform: [{ scale: 1.08 }],
    opacity: 0.85,
  },
});
