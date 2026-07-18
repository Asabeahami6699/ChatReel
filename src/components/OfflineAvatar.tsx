import React, { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';

type Props = {
  uri?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle | ImageStyle>;
};

/** Avatar that never hits via.placeholder.com — letter tile when URI missing/broken. */
export function OfflineAvatar({ uri, name, size = 40, style }: Props) {
  const [error, setError] = useState(false);
  const letter = (name?.trim()?.charAt(0) || '?').toUpperCase();
  const badUri =
    !uri ||
    error ||
    uri.includes('placeholder.com') ||
    uri.includes('via.placeholder');

  if (badUri) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size / 2 },
          style as StyleProp<ViewStyle>,
        ]}
      >
        <Text style={[styles.letter, { fontSize: Math.max(12, size * 0.4) }]}>{letter}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        style as StyleProp<ImageStyle>,
      ]}
      onError={() => setError(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontWeight: '700',
    color: '#374151',
  },
});
