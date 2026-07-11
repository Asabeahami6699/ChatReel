import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ReelDTO } from '../../lib/api';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { getReelMediaItems } from '../../lib/reelPlayback';
import { ReelFeedMedia } from './ReelFeedMedia';
import { ReelEndScreen } from './ReelEndScreen';
import { reelAuthorLabel } from './reelFeedRowUtils';

type Props = {
  item: ReelDTO;
  index: number;
  currentIndex: number;
  reelWidth: number;
  reelHeight: number;
  isFocused: boolean;
  mediaShouldPlay: boolean;
  isMuted: boolean;
  volume: number;
  isReady: boolean;
  videoUri: string;
  onReady: (reelId: string) => void;
  onPlaybackStatus: (reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => void;
  onRef: (reelId: string, ref: ReelPlayerHandle | null) => void;
  onMediaIndexChange: (reelId: string, mediaIndex: number) => void;
  showEndScreen?: boolean;
};

/**
 * Video-only page. Default pointerEvents="none" so the parent ScrollView owns pans.
 * Multi-item albums use box-none so the horizontal pager can still slide.
 */
function ReelPageMediaComponent({
  item,
  index,
  currentIndex,
  reelWidth,
  reelHeight,
  isFocused,
  mediaShouldPlay,
  isMuted,
  volume,
  isReady,
  videoUri,
  onReady,
  onPlaybackStatus,
  onRef,
  onMediaIndexChange,
  showEndScreen = false,
}: Props) {
  const isCurrent = index === currentIndex;
  const rowPlaying = isCurrent && mediaShouldPlay;
  const isAlbum = getReelMediaItems(item).length > 1;

  return (
    <View
      style={[styles.page, { width: reelWidth, height: reelHeight }]}
      pointerEvents={isAlbum ? 'box-none' : 'none'}
    >
      <ReelFeedMedia
        reel={item}
        reelIndex={index}
        currentReelIndex={currentIndex}
        videoUri={videoUri}
        frameWidth={reelWidth}
        frameHeight={reelHeight}
        isFocused={isFocused}
        isPlaying={rowPlaying}
        isMuted={isMuted}
        volume={isMuted ? 0 : volume}
        isReady={isReady}
        onReady={onReady}
        onPlaybackStatus={onPlaybackStatus}
        onRef={onRef}
        onMediaIndexChange={onMediaIndexChange}
      />
      {showEndScreen && isCurrent ? (
        <View style={styles.endScreen} pointerEvents="none">
          <ReelEndScreen ownerName={reelAuthorLabel(item)} />
        </View>
      ) : null}
    </View>
  );
}

export const ReelPageMedia = memo(ReelPageMediaComponent);

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  endScreen: {
    ...StyleSheet.absoluteFillObject,
  },
});
