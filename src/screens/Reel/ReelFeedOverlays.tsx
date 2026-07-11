import React from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import { ReelBrandBadge } from './ReelBrandBadge';
import { REEL_ACCENT } from './reelTheme';
import { REEL_CONTENT_SHIFT_DOWN, REEL_PROGRESS_BAR_HEIGHT } from './reelVideoLayout';
import { reelAuthorLabel } from './reelFeedRowUtils';

type Props = {
  reel: ReelDTO | null;
  reelWidth: number;
  reelHeight: number;
  usePhoneFrame: boolean;
  progress: number;
  bufferedProgress: number;
  progressBottom: number;
  isScrubbing: boolean;
  playbackIcon: 'play' | 'pause' | null;
  badgePlayCycle: number;
  heartScale: Animated.Value;
  heartOpacity: Animated.Value;
  progressPanHandlers: object;
};

/** Current-reel overlays kept outside FlatList so progress ticks don't re-render every row. */
export function ReelFeedOverlays({
  reel,
  reelWidth,
  reelHeight,
  usePhoneFrame,
  progress,
  bufferedProgress,
  progressBottom,
  isScrubbing,
  playbackIcon,
  badgePlayCycle,
  heartScale,
  heartOpacity,
  progressPanHandlers,
}: Props) {
  if (!reel) return null;

  const ownerName = reelAuthorLabel(reel);

  return (
    <View
      style={[
        styles.layer,
        { height: reelHeight },
        !usePhoneFrame && { transform: [{ translateY: REEL_CONTENT_SHIFT_DOWN }] },
        usePhoneFrame && { width: reelWidth, alignSelf: 'flex-start' },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          styles.heartAnimation,
          { transform: [{ scale: heartScale }], opacity: heartOpacity },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="heart" size={100} color={REEL_ACCENT} />
      </Animated.View>

      <ReelBrandBadge
        ownerName={ownerName}
        frameWidth={reelWidth}
        frameHeight={reelHeight}
        progressBottom={progressBottom}
        playCycle={badgePlayCycle}
        compact={!usePhoneFrame}
      />

      {playbackIcon && (
        <View style={styles.playbackIconOverlay} pointerEvents="none">
          <Ionicons
            name={playbackIcon === 'play' ? 'play' : 'pause'}
            size={56}
            color="#fff"
          />
        </View>
      )}

      <View
        style={[
          styles.progressContainer,
          { bottom: progressBottom },
          usePhoneFrame && { width: reelWidth },
          Platform.OS === 'web' && (isScrubbing ? styles.progressScrubbing : styles.progressGrab),
        ]}
        {...progressPanHandlers}
      >
        <View style={styles.progressBg}>
          <View style={[styles.progressBuffered, { width: `${bufferedProgress * 100}%` }]} />
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 12,
    elevation: 12,
  },
  progressContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 28,
    zIndex: 17,
    elevation: 17,
    justifyContent: 'flex-end',
  },
  progressGrab: {
    cursor: 'grab',
  } as object,
  progressScrubbing: {
    cursor: 'grabbing',
  } as object,
  progressBg: {
    height: REEL_PROGRESS_BAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: REEL_PROGRESS_BAR_HEIGHT / 2,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBuffered: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: REEL_PROGRESS_BAR_HEIGHT / 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: REEL_PROGRESS_BAR_HEIGHT / 2,
  },
  playbackIconOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -34,
    marginTop: -34,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 11,
  },
  heartAnimation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -50,
    marginTop: -50,
    zIndex: 10,
  },
});
