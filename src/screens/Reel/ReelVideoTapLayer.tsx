import React, { useRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { dbgReelSwipe } from './dbgReelSwipe';
import { wasRecentReelWebSwipe } from './reelWebSwipeGate';

type Props = {
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
};

/** RN-web often omits pageX/pageY on touch nativeEvents. */
function touchPagePoint(e: { nativeEvent: Record<string, unknown> }) {
  const ne = e.nativeEvent as {
    pageX?: number;
    pageY?: number;
    clientX?: number;
    clientY?: number;
    locationX?: number;
    locationY?: number;
    touches?: Array<{ pageX?: number; pageY?: number; clientX?: number; clientY?: number }>;
    changedTouches?: Array<{ pageX?: number; pageY?: number; clientX?: number; clientY?: number }>;
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
  const moveLogRef = useRef(0);

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
        const { x: pageX, y: pageY } = touchPagePoint(e);
        startRef.current = { x: pageX, y: pageY };
        movedRef.current = false;
        longFiredRef.current = false;
        clearLongTimer();
        // #region agent log
        dbgReelSwipe('B', 'ReelVideoTapLayer.tsx:onTouchStart', 'tap layer touch start', {
          pageX,
          pageY,
        });
        // #endregion
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
        // #region agent log
        const start = startRef.current;
        const now = Date.now();
        if (start && now - moveLogRef.current > 150) {
          const dx = pageX - start.x;
          const dy = pageY - start.y;
          if (Math.abs(dy) > 15 || Math.abs(dx) > 15) {
            moveLogRef.current = now;
            dbgReelSwipe('B', 'ReelVideoTapLayer.tsx:onTouchMove', 'tap layer move past slop', {
              dx,
              dy,
              moved: movedRef.current,
            });
          }
        }
        // #endregion
      }}
      onTouchEnd={(e) => {
        clearLongTimer();
        const { x: pageX, y: pageY } = touchPagePoint(e);
        markMovedIfNeeded(pageX, pageY);
        // #region agent log
        dbgReelSwipe('B', 'ReelVideoTapLayer.tsx:onTouchEnd', 'tap layer touch end', {
          moved: movedRef.current,
          longFired: longFiredRef.current,
          swipeGate: wasRecentReelWebSwipe(),
          willPress:
            !movedRef.current &&
            !longFiredRef.current &&
            !!startRef.current &&
            !wasRecentReelWebSwipe(),
        });
        // #endregion
        if (
          !movedRef.current &&
          !longFiredRef.current &&
          startRef.current &&
          !wasRecentReelWebSwipe()
        ) {
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
