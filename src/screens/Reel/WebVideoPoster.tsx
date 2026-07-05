import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
};

/** Web-only first-frame poster while the stream loads. */
export function WebVideoPoster({ uri, style }: Props) {
  if (Platform.OS !== 'web' || !uri) return null;
  const src = uri.includes('#') ? uri : `${uri}#t=0.1`;
  return (
    <View style={[styles.fill, style]} pointerEvents="none">
      {React.createElement('video', {
        src,
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
  fill: {
    ...StyleSheet.absoluteFill,
  },
});
