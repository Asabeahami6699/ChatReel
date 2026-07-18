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

/** URIs that have already faded in once this session — skip re-fade on remount. */
const warmedUris = new Set<string>();

/**
 * Soft blur/placeholder while decoding — avoids black tile + progressive JPEG
 * left-to-right paint. Sharp image fades in once loaded.
 * Already-warmed URIs stay visible immediately (no flicker on chat-list message updates).
 */
export function SoftFadeImage({
  uri,
  style,
  resizeMode = 'cover',
  onError,
  fallback,
}: Props) {
  const alreadyWarm = Boolean(uri && warmedUris.has(uri));
  const opacity = useRef(new Animated.Value(alreadyWarm ? 1 : 0)).current;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(alreadyWarm);
  const prevUriRef = useRef(uri);

  useEffect(() => {
    if (prevUriRef.current === uri) return;
    prevUriRef.current = uri;
    const warm = Boolean(uri && warmedUris.has(uri));
    opacity.setValue(warm ? 1 : 0);
    setFailed(false);
    setLoaded(warm);
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
          const skipFade = warmedUris.has(uri);
          warmedUris.add(uri);
          setLoaded(true);
          if (skipFade) {
            opacity.setValue(1);
            return;
          }
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
