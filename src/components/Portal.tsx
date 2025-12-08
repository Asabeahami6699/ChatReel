// src/components/Portal.tsx
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
}

export default function Portal({ children }: PortalProps) {
  // Mobile: Render normally
  if (Platform.OS !== 'web') {
    return <View style={styles.container}>{children}</View>;
  }

  // Web: Render at <body> level
  if (typeof document !== 'undefined') {
    return createPortal(children, document.body);
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999999,
  },
});