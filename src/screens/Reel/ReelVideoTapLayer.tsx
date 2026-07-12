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

/** Cancel tap if the finger moved — stricter on X because feed pages horizontally. */
const TAP_SLOP_X = 8;
const TAP_SLOP_Y = 12;

/**
 * Passive touch observers only — never become the JS responder.
 * Must be a CHILD of the paging ScrollView (not a sibling overlay above it).
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

  const markMovedIfNeeded = (pageX: number, pageY: number) => {
    const start = startRef.current;
    if (!start || movedRef.current) return;
    const dx = Math.abs(pageX - start.x);
    const dy = Math.abs(pageY - start.y);
    if (dx > TAP_SLOP_X || dy > TAP_SLOP_Y) {
      movedRef.current = true;
      clearLongTimer();
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
        markMovedIfNeeded(e.nativeEvent.pageX, e.nativeEvent.pageY);
      }}
      onTouchEnd={(e) => {
        clearLongTimer();
        markMovedIfNeeded(e.nativeEvent.pageX, e.nativeEvent.pageY);
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

const webPanStyle = { touchAction: 'pan-x' } as object;
