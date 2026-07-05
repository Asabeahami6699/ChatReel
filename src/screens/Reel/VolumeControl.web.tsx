import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const VOL_TRACK_H = 100;
const VOL_THUMB = 14;

function iconChar(muted: boolean, vol: number): string {
  if (muted || vol === 0) return '🔇';
  if (vol < 0.5) return '🔈';
  return '🔊';
}

export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onMuteToggle,
}: {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (v: number) => void;
  onMuteToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
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
      const node = trackRef.current;
      if (!node) return volume;
      const rect = node.getBoundingClientRect();
      const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return Math.round(ratio * 100) / 100;
    },
    [volume]
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = true;
      clearHideTimer();
      setOpen(true);
      onVolumeChange(volFromY(e.clientY));
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

  return (
    <View style={styles.host} pointerEvents="box-none">
      {React.createElement(
        'div',
        {
          style: {
            position: 'absolute',
            top: 16,
            right: 14,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'auto',
          },
          onMouseEnter: () => {
            clearHideTimer();
            setOpen(true);
          },
          onMouseLeave: () => {
            if (!draggingRef.current) scheduleHide();
          },
          onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
        },
        React.createElement(
          'button',
          {
            type: 'button',
            'aria-label': 'Volume',
            style: {
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: '8px 10px',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
            },
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              clearHideTimer();
              setOpen(true);
              onMuteToggle();
            },
          },
          iconChar(isMuted, displayVol)
        ),
        open
          ? React.createElement(
              'div',
              {
                style: {
                  width: 40,
                  padding: '10px 0',
                  background: 'rgba(20,20,20,0.92)',
                  borderRadius: 20,
                  marginTop: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                },
              },
              React.createElement(
                'span',
                { style: { color: '#fff', fontSize: 10, fontWeight: 700 } },
                `${Math.round(displayVol * 100)}`
              ),
              React.createElement(
                'div',
                {
                  ref: trackRef,
                  style: {
                    width: 6,
                    height: VOL_TRACK_H,
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: 3,
                    position: 'relative',
                    cursor: 'pointer',
                  },
                  onPointerDown: onTrackPointerDown,
                },
                React.createElement('div', {
                  style: {
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${displayVol * 100}%`,
                    background: '#fff',
                    borderRadius: 3,
                  },
                }),
                React.createElement('div', {
                  style: {
                    position: 'absolute',
                    left: -4,
                    bottom: `calc(${displayVol * 100}% - ${VOL_THUMB / 2}px)`,
                    width: VOL_THUMB,
                    height: VOL_THUMB,
                    borderRadius: VOL_THUMB / 2,
                    background: '#fff',
                  },
                })
              )
            )
          : null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    pointerEvents: 'box-none',
  },
});
