import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
};

export function ReelActionIcon({ name, size = 28, color = '#fff' }: Props) {
  return (
    <View style={[styles.container, { width: size + 6, height: size + 6 }]}>
      <Ionicons
        name={name}
        size={size}
        color="rgba(0,0,0,0.55)"
        style={styles.depth}
      />
      <Ionicons name={name} size={size} color={color} style={styles.glyph} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  depth: {
    position: 'absolute',
    top: 2,
    left: 1,
  },
  glyph: {
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
