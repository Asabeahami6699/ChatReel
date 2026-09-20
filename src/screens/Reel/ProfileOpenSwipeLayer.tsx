import React, { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

type Props = {
  enabled: boolean;
  onSwipeLeft: () => void;
};

/**
 * Edge gesture: clear left swipe opens the creator profile feed.
 * Vertical pans and small moves are ignored so the reel pager keeps working.
 */
export function ProfileOpenSwipeLayer({ enabled, onSwipeLeft }: Props) {
  const enabledRef = useRef(enabled);
  const onSwipeLeftRef = useRef(onSwipeLeft);
  enabledRef.current = enabled;
  onSwipeLeftRef.current = onSwipeLeft;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          if (!enabledRef.current) return false;
          // Leftward + clearly horizontal.
          return g.dx < -14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35;
        },
        onMoveShouldSetPanResponderCapture: (_, g) => {
          if (!enabledRef.current) return false;
          return g.dx < -18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          if (!enabledRef.current) return;
          if (g.dx < -72 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2) {
            onSwipeLeftRef.current();
          }
        },
      }),
    []
  );

  if (!enabled) return null;

  return (
    <View
      style={[styles.layer, { right: 72 }]}
      pointerEvents="box-only"
      {...pan.panHandlers}
    />
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
});
