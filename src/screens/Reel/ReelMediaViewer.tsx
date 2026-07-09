import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ReelDTO } from '../../lib/api';
import { getReelMediaItems } from '../../lib/reelPlayback';
import { ReelMediaSlide } from './ReelMediaSlide';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { useReelSoundPlayback } from '../../hooks/useReelSoundPlayback';

type Props = {
  reel: ReelDTO;
  shouldPlay?: boolean;
  isMuted?: boolean;
};

export function ReelMediaViewer({ reel, shouldPlay = true, isMuted = false }: Props) {
  const { width: frameWidth, height: frameHeight } = useWindowDimensions();
  const mediaItems = getReelMediaItems(reel);
  const [mediaIndex, setMediaIndex] = useState(0);
  const mediaIndexRef = useRef(0);
  const listRef = useRef<FlatList>(null);
  const playersRef = useRef<Record<string, ReelPlayerHandle | null>>({});

  useReelSoundPlayback(reel, {
    active: shouldPlay,
    playing: shouldPlay,
    muted: isMuted,
    focused: true,
    masterVolume: isMuted ? 0 : 1,
  });

  useEffect(() => {
    mediaIndexRef.current = mediaIndex;
  }, [mediaIndex]);

  useEffect(() => {
    return () => {
      void Promise.all(Object.values(playersRef.current).map((p) => p?.pauseAsync()));
    };
  }, []);

  useEffect(() => {
    if (!shouldPlay) {
      void Promise.all(Object.values(playersRef.current).map((p) => p?.pauseAsync()));
    }
  }, [shouldPlay]);

  const pauseInactiveSlides = async (activeIndex: number) => {
    await Promise.all(
      Object.entries(playersRef.current).map(async ([key, player]) => {
        if (!player) return;
        const match = key.match(/:(\d+)$/);
        const slideIndex = match ? Number(match[1]) : 0;
        if (slideIndex !== activeIndex) {
          await player.pauseAsync();
        }
      })
    );
  };

  const setActiveIndex = (next: number) => {
    if (next === mediaIndexRef.current) return;
    mediaIndexRef.current = next;
    setMediaIndex(next);
    void pauseInactiveSlides(next);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / frameWidth);
    if (Number.isFinite(next)) setActiveIndex(next);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / frameWidth);
    if (Number.isFinite(next)) setActiveIndex(next);
  };

  const handleRef = (key: string, ref: ReelPlayerHandle | null) => {
    if (ref) playersRef.current[key] = ref;
    else delete playersRef.current[key];
  };

  const noopReady = (_key: string) => undefined;
  const noopStatus = (_key: string, _status: ReelPlaybackStatus, _active: boolean) => undefined;

  if (mediaItems.length <= 1) {
    const media = mediaItems[0];
    return (
      <ReelMediaSlide
        reel={reel}
        media={media}
        frameWidth={frameWidth}
        frameHeight={frameHeight}
        slideKey={reel.id}
        isActiveSlide
        isFocused
        isPlaying={shouldPlay}
        isMuted={isMuted}
        isReady
        onReady={noopReady}
        onPlaybackStatus={noopStatus}
        onRef={handleRef}
      />
    );
  }

  return (
    <View style={[styles.shell, { width: frameWidth, height: frameHeight }]}>
      <FlatList
        ref={listRef}
        data={mediaItems}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
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
            slideKey={`${reel.id}:${index}`}
            isActiveSlide={index === mediaIndex}
            isFocused
            isPlaying={shouldPlay}
            isMuted={isMuted}
            isReady
            onReady={noopReady}
            onPlaybackStatus={noopStatus}
            onRef={handleRef}
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

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    top: 16,
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
