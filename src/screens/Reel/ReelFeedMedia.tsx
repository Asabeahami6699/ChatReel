import React, { memo, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import type { ReelDTO } from '../../lib/api';
import { getReelMediaItems } from '../../lib/reelPlayback';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { ReelMediaSlide } from './ReelMediaSlide';
import { useReelSoundPlayback, reelVideoVoiceVolume } from '../../hooks/useReelSoundPlayback';

type Props = {
  reel: ReelDTO;
  reelIndex: number;
  currentReelIndex: number;
  videoUri: string;
  frameWidth: number;
  frameHeight: number;
  isFocused: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  volume?: number;
  isReady: boolean;
  onReady: (reelId: string) => void;
  onPlaybackStatus: (reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => void;
  onRef: (reelId: string, ref: ReelPlayerHandle | null) => void;
  onMediaIndexChange?: (reelId: string, index: number) => void;
};

function ReelFeedMediaComponent({
  reel,
  reelIndex,
  currentReelIndex,
  videoUri,
  frameWidth,
  frameHeight,
  isFocused,
  isPlaying,
  isMuted,
  volume,
  isReady,
  onReady,
  onPlaybackStatus,
  onRef,
  onMediaIndexChange,
}: Props) {
  const mediaItems = getReelMediaItems(reel);
  const isCurrentReel = reelIndex === currentReelIndex;
  const [mediaIndex, setMediaIndex] = useState(0);

  const masterVol = isMuted ? 0 : (volume ?? 1);
  const videoVolume = reelVideoVoiceVolume(reel, masterVol);

  useReelSoundPlayback(reel, {
    active: isCurrentReel,
    playing: isPlaying,
    muted: isMuted,
    focused: isFocused,
    masterVolume: masterVol,
  });

  const mediaIndexRef = useRef(0);
  const listRef = useRef<FlatList>(null);
  const onMediaIndexChangeRef = useRef(onMediaIndexChange);
  const reelIdRef = useRef(reel.id);
  onMediaIndexChangeRef.current = onMediaIndexChange;
  reelIdRef.current = reel.id;

  useEffect(() => {
    mediaIndexRef.current = mediaIndex;
  }, [mediaIndex]);

  useEffect(() => {
    if (!isCurrentReel) {
      setMediaIndex(0);
      mediaIndexRef.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [isCurrentReel]);

  const slideKey = (index: number) => `${reel.id}:${index}`;

  const setActiveIndex = (next: number) => {
    if (next === mediaIndexRef.current) return;
    mediaIndexRef.current = next;
    setMediaIndex(next);
    onMediaIndexChangeRef.current?.(reelIdRef.current, next);
  };

  const advanceToMediaIndex = (next: number) => {
    if (next < 0 || next >= mediaItems.length) return;
    setActiveIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  };

  /** Multi-item album: when a clip ends, go to the next slide instead of looping. */
  const handleSlidePlaybackStatus = (
    key: string,
    status: ReelPlaybackStatus,
    active: boolean
  ) => {
    const isActiveKey =
      key === slideKey(mediaIndexRef.current) ||
      (mediaItems.length === 1 && key === reel.id);
    if (!isActiveKey) return;

    if (status.didJustFinish && isCurrentReel && active && mediaItems.length > 1) {
      const next = mediaIndexRef.current + 1;
      if (next < mediaItems.length) {
        advanceToMediaIndex(next);
        return;
      }
    }

    onPlaybackStatus(reel.id, status, isCurrentReel && active);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / frameWidth);
    if (Number.isFinite(next)) setActiveIndex(next);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / frameWidth);
    if (Number.isFinite(next)) setActiveIndex(next);
  };

  if (mediaItems.length <= 1) {
    const media = mediaItems[0];
    return (
      <ReelMediaSlide
        reel={reel}
        media={media}
        frameWidth={frameWidth}
        frameHeight={frameHeight}
        slideKey={reel.id}
        isActiveSlide={isCurrentReel}
        isFocused={isFocused}
        isPlaying={isPlaying}
        isMuted={isMuted}
        volume={videoVolume}
        isReady={isReady}
        videoUri={videoUri}
        onReady={() => onReady(reel.id)}
        onPlaybackStatus={(_key, status, active) =>
          onPlaybackStatus(reel.id, status, isCurrentReel && active)
        }
        onRef={(_key, ref) => onRef(reel.id, ref)}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={mediaItems}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        scrollEnabled={isCurrentReel}
        nestedScrollEnabled
        directionalLockEnabled
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, index) => ({
          length: frameWidth,
          offset: frameWidth * index,
          index,
        })}
        renderItem={({ item, index }) => (
          <ReelMediaSlide
            reel={reel}
            media={item}
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            slideKey={slideKey(index)}
            isActiveSlide={isCurrentReel && index === mediaIndex}
            isFocused={isFocused}
            isPlaying={isPlaying}
            isMuted={isMuted}
            volume={videoVolume}
            isReady={isReady}
            onReady={(key) => {
              if (key === slideKey(mediaIndex) || mediaItems.length === 1) onReady(reel.id);
            }}
            onPlaybackStatus={handleSlidePlaybackStatus}
            onRef={(key, ref) => onRef(key, ref)}
          />
        )}
      />
      <View style={styles.dots} pointerEvents="none">
        {mediaItems.map((item, index) => (
          <View key={item.id} style={[styles.dot, index === mediaIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function feedMediaPropsEqual(prev: Props, next: Props): boolean {
  if (prev.reel.id !== next.reel.id) return false;
  if (prev.reel.sound_id !== next.reel.sound_id) return false;
  if (prev.reel.sound?.id !== next.reel.sound?.id) return false;
  if (prev.reel.transcode_status !== next.reel.transcode_status) return false;
  if (prev.reel.hls_url !== next.reel.hls_url) return false;
  if (prev.reelIndex !== next.reelIndex) return false;
  if (prev.videoUri !== next.videoUri) return false;
  if (prev.frameWidth !== next.frameWidth || prev.frameHeight !== next.frameHeight) return false;
  if (prev.isReady !== next.isReady) return false;
  if (prev.isMuted !== next.isMuted || prev.volume !== next.volume) return false;

  const prevCurrent = prev.reelIndex === prev.currentReelIndex;
  const nextCurrent = next.reelIndex === next.currentReelIndex;
  if (prevCurrent || nextCurrent) {
    if (prev.currentReelIndex !== next.currentReelIndex) return false;
    if (prev.isFocused !== next.isFocused) return false;
    if (prev.isPlaying !== next.isPlaying) return false;
  }
  return true;
}

export const ReelFeedMedia = memo(ReelFeedMediaComponent, feedMediaPropsEqual);

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  dots: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
