import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const VOL_TRACK_H = 100;
const VOL_THUMB = 14;

export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onMuteToggle,
  style,
  inline = false,
}: {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (v: number) => void;
  onMuteToggle: () => void;
  style?: StyleProp<ViewStyle>;
  /** Place in normal layout flow (e.g. top bar) instead of absolute overlay. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trackRef = useRef<View>(null);
  const draggingRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      if (!draggingRef.current) setOpen(false);
    }, 800);
  };

  const volFromY = useCallback(
    (clientY: number) => {
      const node = trackRef.current as unknown as HTMLElement | null;
      if (!node) return volume;
      const rect = node.getBoundingClientRect();
      const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return Math.round(ratio * 100) / 100;
    },
    [volume]
  );

  const onTrackPointerDown = useCallback(
    (e: { clientY: number; preventDefault?: () => void }) => {
      e.preventDefault?.();
      draggingRef.current = true;
      clearHideTimer();
      setOpen(true);
      onVolumeChange(volFromY(e.clientY));
      if (Platform.OS !== 'web') return;
      const onMove = (ev: PointerEvent) => onVolumeChange(volFromY(ev.clientY));
      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        scheduleHide();
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [volFromY, onVolumeChange]
  );

  const displayVol = isMuted ? 0 : volume;
  const icon: keyof typeof Ionicons.glyphMap =
    isMuted || displayVol === 0
      ? 'volume-mute'
      : displayVol < 0.5
        ? 'volume-low'
        : 'volume-medium';

  return (
    <View style={[styles.wrap, inline && styles.wrapInline, style]} pointerEvents="auto">
      <Pressable
        style={styles.btn}
        onPress={(e) => {
          e.stopPropagation?.();
          clearHideTimer();
          setOpen(true);
          onMuteToggle();
        }}
        hitSlop={10}
      >
        <Ionicons name={icon} size={20} color="#fff" />
      </Pressable>
      {open && (
        <View style={styles.dropdown}>
          <Text style={styles.pct}>{Math.round(displayVol * 100)}</Text>
          <View
            ref={trackRef}
            style={styles.track}
            // @ts-expect-error web pointer
            onPointerDown={onTrackPointerDown}
          >
            <View style={[styles.fill, { height: `${displayVol * 100}%` }]} />
            <View style={[styles.thumb, { bottom: `${displayVol * 100}%` }]} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 14,
    top: 16,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
  },
  wrapInline: {
    position: 'relative',
    right: 0,
    top: 0,
    zIndex: 1,
    elevation: 1,
  },
  btn: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 8,
  },
  dropdown: {
    width: 40,
    paddingVertical: 10,
    backgroundColor: 'rgba(20,20,20,0.92)',
    borderRadius: 20,
    marginTop: 6,
    alignItems: 'center',
    gap: 6,
  },
  pct: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  track: {
    width: 6,
    height: VOL_TRACK_H,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'visible' as const,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    left: -4,
    width: VOL_THUMB,
    height: VOL_THUMB,
    borderRadius: VOL_THUMB / 2,
    backgroundColor: '#fff',
    marginBottom: -(VOL_THUMB / 2),
  },
});
