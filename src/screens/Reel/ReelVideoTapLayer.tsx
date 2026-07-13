import React, { useRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { wasRecentReelWebSwipe } from './reelWebSwipeGate';

type Props = {
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
};

type TouchPoint = {
  pageX?: number;
  pageY?: number;
  clientX?: number;
  clientY?: number;
  locationX?: number;
  locationY?: number;
};

/** RN-web often omits pageX/pageY on touch nativeEvents. */
function touchPagePoint(e: GestureResponderEvent) {
  const ne = e.nativeEvent as TouchPoint & {
    touches?: TouchPoint[];
    changedTouches?: TouchPoint[];
  };
  const t = ne.touches?.[0] || ne.changedTouches?.[0];
  const x = ne.pageX ?? t?.pageX ?? ne.clientX ?? t?.clientX ?? ne.locationX ?? 0;
  const y = ne.pageY ?? t?.pageY ?? ne.clientY ?? t?.clientY ?? ne.locationY ?? 0;
  return { x, y };
}

/** Cancel tap if the finger moved — stricter on Y because feed pages vertically. */
const TAP_SLOP_X = 12;
const TAP_SLOP_Y = 8;

/**
 * Passive touch observers only — never become the JS responder.
 * Must be a CHILD of the paging ScrollView (not a sibling overlay above it).
 * On web desktop, also handles mouse click (touch events do not fire for mouse).
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
  /** Ignore the synthetic mouse click that follows a touch on hybrid devices. */
  const ignoreMouseClickUntilRef = useRef(0);

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

  const firePressIfTap = () => {
    if (
      !movedRef.current &&
      !longFiredRef.current &&
      startRef.current &&
      !wasRecentReelWebSwipe()
    ) {
      onPress();
    }
    startRef.current = null;
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
        ignoreMouseClickUntilRef.current = Date.now() + 700;
        const { x: pageX, y: pageY } = touchPagePoint(e);
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
        const { x: pageX, y: pageY } = touchPagePoint(e);
        markMovedIfNeeded(pageX, pageY);
      }}
      onTouchEnd={(e) => {
        clearLongTimer();
        const { x: pageX, y: pageY } = touchPagePoint(e);
        markMovedIfNeeded(pageX, pageY);
        firePressIfTap();
      }}
      onTouchCancel={() => {
        clearLongTimer();
        startRef.current = null;
        movedRef.current = true;
      }}
      // @ts-expect-error RN-web mouse click for desktop pause/like
      onClick={(e: { stopPropagation?: () => void }) => {
        if (Platform.OS !== 'web') return;
        if (Date.now() < ignoreMouseClickUntilRef.current) return;
        if (wasRecentReelWebSwipe()) return;
        e.stopPropagation?.();
        onPress();
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

const webPanStyle = { touchAction: 'pan-y', cursor: 'pointer' } as object;
