import React, { useRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
};

/**
 * Passive touch observers only — never become the JS responder and never
 * register an RNGH gesture. Pressable / GestureDetector / TouchableOpacity
 * all steal vertical pans from the parent pager — this is true on native
 * (Android especially) AND on web (react-native-web's Pressable claims the
 * touch responder on touchstart/pointerdown just like native Touchables do,
 * which is what was blocking swipe-to-advance on mobile Chrome).
 * So both platforms use this same touch-listener-only implementation.
 */
export function ReelVideoTapLayer({
  style,
  onPress,
  onLongPress,
  delayLongPress = 700,
}: Props) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const longTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  const clearLongTimer = () => {
    if (longTimerRef.current) {
      clearTimeout(longTimerRef.current);
      longTimerRef.current = null;
    }
  };

  return (
    <View
      style={[styles.overlay, style, Platform.OS === 'web' ? webPanStyle : null]}
      collapsable={false}
      onStartShouldSetResponder={() => false}
      onMoveShouldSetResponder={() => false}
      onStartShouldSetResponderCapture={() => false}
      onMoveShouldSetResponderCapture={() => false}
      onTouchStart={(e) => {
        const { pageX, pageY } = e.nativeEvent;
        startRef.current = { x: pageX, y: pageY };
        movedRef.current = false;
        longFiredRef.current = false;
        clearLongTimer();
        if (onLongPress) {
          longTimerRef.current = setTimeout(() => {
            if (!movedRef.current) {
              longFiredRef.current = true;
              onLongPress();
            }
          }, delayLongPress);
        }
      }}
      onTouchMove={(e) => {
        const start = startRef.current;
        if (!start || movedRef.current) return;
        const dx = Math.abs(e.nativeEvent.pageX - start.x);
        const dy = Math.abs(e.nativeEvent.pageY - start.y);
        if (dx > 10 || dy > 10) {
          movedRef.current = true;
          clearLongTimer();
        }
      }}
      onTouchEnd={() => {
        clearLongTimer();
        if (!movedRef.current && !longFiredRef.current && startRef.current) {
          onPress();
        }
        startRef.current = null;
      }}
      onTouchCancel={() => {
        clearLongTimer();
        startRef.current = null;
        movedRef.current = true;
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3,
  },
});

// touchAction isn't in RN's ViewStyle typings — cast, same pattern this
// codebase already uses for web-only CSS (e.g. `cursor` in ReelsScreen styles).
const webPanStyle = { touchAction: 'pan-y' } as object;
