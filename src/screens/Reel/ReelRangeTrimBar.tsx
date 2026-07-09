import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { REEL_ACCENT } from './reelTheme';

const MIN_GAP = 0.5;
const HANDLE_W = 14;
const HIT_SLOP = 22;

export type ReelRangeTrimBarProps = {
  duration: number;
  rangeStart: number;
  rangeEnd: number;
  /** Playhead position — synced with video or music playback. */
  position: number;
  minGap?: number;
  title?: string;
  accentColor?: string;
  onRangeStartChange: (sec: number) => void;
  onRangeEndChange: (sec: number) => void;
  onRangeStartComplete?: (sec: number) => void;
  onRangeEndComplete?: (sec: number) => void;
  onPositionChange: (sec: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: (sec: number) => void;
  hint?: string;
};

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

type DragMode = 'start' | 'end' | 'scrub';

export function ReelRangeTrimBar({
  duration,
  rangeStart,
  rangeEnd,
  position,
  minGap = MIN_GAP,
  title = 'Trim',
  accentColor = REEL_ACCENT,
  onRangeStartChange,
  onRangeEndChange,
  onRangeStartComplete,
  onRangeEndComplete,
  onPositionChange,
  onScrubStart,
  onScrubEnd,
  hint = 'Drag handles to trim · drag inside to scrub',
}: ReelRangeTrimBarProps) {
  const [trackWidth, setTrackWidth] = useState(1);
  const dragModeRef = useRef<DragMode | null>(null);
  const trackWidthRef = useRef(1);
  const rangeStartRef = useRef(rangeStart);
  const rangeEndRef = useRef(rangeEnd);
  const lastDragSecRef = useRef(0);

  rangeStartRef.current = rangeStart;
  rangeEndRef.current = rangeEnd;

  const onRangeStartChangeRef = useRef(onRangeStartChange);
  const onRangeEndChangeRef = useRef(onRangeEndChange);
  const onPositionChangeRef = useRef(onPositionChange);
  onRangeStartChangeRef.current = onRangeStartChange;
  onRangeEndChangeRef.current = onRangeEndChange;
  onPositionChangeRef.current = onPositionChange;

  const secToX = useCallback(
    (sec: number) => (duration > 0 ? (sec / duration) * trackWidthRef.current : 0),
    [duration]
  );

  const xToSec = useCallback(
    (x: number) => {
      const w = trackWidthRef.current;
      if (w <= 0 || duration <= 0) return 0;
      return clamp((x / w) * duration, 0, duration);
    },
    [duration]
  );

  const resolveDragMode = useCallback(
    (x: number): DragMode => {
      const startX = secToX(rangeStartRef.current);
      const endX = secToX(rangeEndRef.current);
      if (Math.abs(x - startX) <= HIT_SLOP) return 'start';
      if (Math.abs(x - endX) <= HIT_SLOP) return 'end';
      if (x >= startX && x <= endX) return 'scrub';
      return x < startX ? 'start' : 'end';
    },
    [secToX]
  );

  const applyDrag = useCallback(
    (x: number) => {
      const mode = dragModeRef.current;
      if (!mode || duration <= minGap) return;
      const sec = xToSec(x);
      const rs = rangeStartRef.current;
      const re = rangeEndRef.current;

      if (mode === 'start') {
        const v = clamp(sec, 0, re - minGap);
        lastDragSecRef.current = v;
        onRangeStartChangeRef.current(v);
      } else if (mode === 'end') {
        const v = clamp(sec, rs + minGap, duration);
        lastDragSecRef.current = v;
        onRangeEndChangeRef.current(v);
      } else {
        const pos = clamp(sec, rs, re);
        lastDragSecRef.current = pos;
        onPositionChangeRef.current(pos);
      }
    },
    [duration, minGap, xToSec]
  );

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    setTrackWidth(w);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const x = evt.nativeEvent.locationX;
          const mode = resolveDragMode(x);
          dragModeRef.current = mode;
          if (mode === 'scrub') onScrubStart?.();
          applyDrag(x);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          applyDrag(evt.nativeEvent.locationX);
        },
        onPanResponderRelease: (evt: GestureResponderEvent) => {
          const mode = dragModeRef.current;
          const sec = xToSec(evt.nativeEvent.locationX);
          if (mode === 'scrub') {
            onScrubEnd?.(sec);
          } else if (mode === 'start') {
            onRangeStartComplete?.(lastDragSecRef.current);
          } else if (mode === 'end') {
            onRangeEndComplete?.(lastDragSecRef.current);
          }
          dragModeRef.current = null;
        },
        onPanResponderTerminate: () => {
          dragModeRef.current = null;
        },
      }),
      [applyDrag, onRangeEndComplete, onRangeStartComplete, onScrubEnd, onScrubStart, resolveDragMode, xToSec]
  );

  const startX = secToX(rangeStart);
  const endX = secToX(rangeEnd);
  const posX = secToX(clamp(position, rangeStart, rangeEnd));
  const selectionW = Math.max(0, endX - startX);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {formatTime(rangeEnd - rangeStart)} · {formatTime(rangeStart)}–{formatTime(rangeEnd)}
        </Text>
      </View>

      <View style={styles.barTouch} onLayout={onTrackLayout} {...panResponder.panHandlers}>
        <View style={styles.track}>
          <View style={styles.trackLine} pointerEvents="none" />
          {/* Dimmed regions outside selection */}
          {startX > 0 ? (
            <View style={[styles.dim, { left: 0, width: startX }]} />
          ) : null}
          {endX < trackWidth ? (
            <View style={[styles.dim, { left: endX, width: Math.max(0, trackWidth - endX) }]} />
          ) : null}

          {/* Selected range */}
          <View
            style={[
              styles.selection,
              { left: startX, width: selectionW, backgroundColor: `${accentColor}88` },
            ]}
          />

          {/* Playhead */}
          <View style={[styles.playhead, { left: posX - 1 }]} />

          {/* Start handle */}
          <View
            style={[styles.handle, styles.handleStart, { left: startX - HANDLE_W / 2 }]}
            pointerEvents="none"
          >
            <View style={[styles.handleGrip, { backgroundColor: accentColor }]} />
          </View>

          {/* End handle */}
          <View
            style={[styles.handle, styles.handleEnd, { left: endX - HANDLE_W / 2 }]}
            pointerEvents="none"
          >
            <View style={[styles.handleGrip, { backgroundColor: accentColor }]} />
          </View>
        </View>
      </View>

      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 4 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { color: '#fff', fontSize: 13, fontWeight: '700' },
  meta: { color: '#888', fontSize: 11 },
  barTouch: {
    height: 52,
    justifyContent: 'center',
  },
  track: {
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1e1e1e',
    position: 'relative',
    overflow: 'hidden',
  },
  trackLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: '50%',
    height: StyleSheet.hairlineWidth,
    marginTop: -StyleSheet.hairlineWidth / 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    zIndex: 2,
  },
  dim: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    zIndex: 1,
  },
  selection: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 4,
    zIndex: 1,
  },
  playhead: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
    zIndex: 3,
  },
  handle: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: HANDLE_W,
    zIndex: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleStart: {},
  handleEnd: {},
  handleGrip: {
    width: 4,
    height: 28,
    borderRadius: 2,
    backgroundColor: REEL_ACCENT,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  hint: {
    color: '#666',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
  },
});
