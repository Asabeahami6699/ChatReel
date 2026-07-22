import React from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { stripMediaFragment } from '../../lib/reelPlayback';

type Props = {
  uri: string;
  posterUri?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** Web-only poster while the stream loads (uses thumbnail — no `#t=` cache errors). */
export function WebVideoPoster({ uri, posterUri, style }: Props) {
  if (Platform.OS !== 'web') return null;
  const thumb = posterUri ?? stripMediaFragment(uri);
  if (!thumb) return null;

  if (posterUri) {
    return (
      <View style={[styles.fill, style]} pointerEvents="none">
        <Image source={{ uri: posterUri }} style={styles.img} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View style={[styles.fill, style]} pointerEvents="none">
      {React.createElement('video', {
        src: thumb,
        muted: true,
        playsInline: true,
        preload: 'metadata',
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          backgroundColor: '#000',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  img: { width: '100%', height: '100%' },
});
