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

/** Pixels of movement that cancel a tap (vertical is stricter — that's the swipe axis). */
const TAP_SLOP_X = 12;
const TAP_SLOP_Y = 8;

/**
 * Passive touch observers only — never become the JS responder and never
 * register an RNGH gesture. Pressable / TouchableOpacity steal vertical pans.
 *
 * Important: when a parent ScrollView/FlatList takes the gesture, onTouchMove
 * may never fire on this view. Always re-check pageX/pageY on touchEnd so a
 * swipe does not get mis-detected as a tap (which was pausing the reel).
 */
export function ReelVideoTapLayer({
  style,
  onPress,
  onLongPress,
  delayLongPress = 700,
}: Props) {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
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
        startRef.current = { x: pageX, y: pageY, t: Date.now() };
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
        // Parent scroller often suppresses move events; if the finger still
        // traveled, never treat this as a tap.
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

const webPanStyle = { touchAction: 'pan-y' } as object;
