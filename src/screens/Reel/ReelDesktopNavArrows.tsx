import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  canGoUp: boolean;
  canGoDown: boolean;
  onUp: () => void;
  onDown: () => void;
  /** Distance from horizontal center of the screen to the left edge of this stack. */
  left: number;
};

/** Desktop-only up/down controls to the right of the phone-framed reel. */
export function ReelDesktopNavArrows({ canGoUp, canGoDown, onUp, onDown, left }: Props) {
  return (
    <View style={[styles.wrap, { left }]} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.btn, !canGoUp && styles.btnDisabled]}
        onPress={onUp}
        disabled={!canGoUp}
        accessibilityLabel="Previous reel"
        accessibilityRole="button"
        activeOpacity={0.75}
      >
        <Ionicons name="chevron-up" size={28} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, !canGoDown && styles.btnDisabled]}
        onPress={onDown}
        disabled={!canGoDown}
        accessibilityLabel="Next reel"
        accessibilityRole="button"
        activeOpacity={0.75}
      >
        <Ionicons name="chevron-down" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: '50%',
    marginTop: -56,
    zIndex: 30,
    gap: 12,
  },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.28,
  },
});
