import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { ReelDTO } from '../../lib/api';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { ReelPageMedia } from './ReelPageMedia';
import { ReelVideoTapLayer } from './ReelVideoTapLayer';

export type ReelNativeFeedHandle = {
  scrollToIndex: (index: number, animated?: boolean) => void;
};

type Props = {
  reels: ReelDTO[];
  currentIndex: number;
  reelWidth: number;
  reelHeight: number;
  isFocused: boolean;
  mediaShouldPlay: boolean;
  isMuted: boolean;
  volume: number;
  readyReelIds: Set<string>;
  endScreenReelId: string | null;
  resolveUri: (reel: ReelDTO) => string;
  onIndexChange: (index: number) => void;
  onReady: (reelId: string) => void;
  onPlaybackStatus: (reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => void;
  onRef: (reelId: string, ref: ReelPlayerHandle | null) => void;
  onMediaIndexChange: (reelId: string, mediaIndex: number) => void;
  onVideoPress: (reel: ReelDTO) => void;
  onEndReached?: () => void;
};

/**
 * Vertical paging ScrollView.
 * Tap layer lives INSIDE each page (ScrollView child) so vertical pans
 * can still be claimed by the parent scroller.
 */
export const ReelNativeFeed = forwardRef<ReelNativeFeedHandle, Props>(function ReelNativeFeed(
  {
    reels,
    currentIndex,
    reelWidth,
    reelHeight,
    isFocused,
    mediaShouldPlay,
    isMuted,
    volume,
    readyReelIds,
    endScreenReelId,
    resolveUri,
    onIndexChange,
    onReady,
    onPlaybackStatus,
    onRef,
    onMediaIndexChange,
    onVideoPress,
    onEndReached,
  },
  ref
) {
  const scrollRef = useRef<ScrollView>(null);
  const heightRef = useRef(reelHeight);
  heightRef.current = reelHeight;
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  // Page height changes (measure-after-layout, rotation, split screen) leave the
  // scroller parked between two pages — re-anchor on the reel the user is on.
  useEffect(() => {
    if (reelHeight <= 0) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, indexRef.current) * reelHeight, animated: false });
  }, [reelHeight]);

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number, animated = true) => {
      const h = heightRef.current;
      scrollRef.current?.scrollTo({ y: Math.max(0, index) * h, animated });
    },
  }));

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const h = heightRef.current;
      if (h <= 0) return;
      const y = e.nativeEvent.contentOffset.y;
      const next = Math.max(0, Math.min(reels.length - 1, Math.round(y / h)));
      if (next !== indexRef.current) onIndexChange(next);
      if (next >= reels.length - 4) onEndReached?.();
    },
    [onEndReached, onIndexChange, reels.length]
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Let paging + momentum finish the page change; only nudge when almost settled.
      const h = heightRef.current;
      if (h <= 0) return;
      const y = e.nativeEvent.contentOffset.y;
      const velocity = e.nativeEvent.velocity?.y ?? 0;
      if (Math.abs(velocity) > 0.6) return;
      const raw = Math.round(y / h);
      const anchor = indexRef.current;
      const next = Math.max(anchor - 1, Math.min(anchor + 1, raw));
      const clamped = Math.max(0, Math.min(reels.length - 1, next));
      const targetY = clamped * h;
      if (Math.abs(y - targetY) > h * 0.12) {
        scrollRef.current?.scrollTo({ y: targetY, animated: true });
      }
      if (clamped !== indexRef.current) onIndexChange(clamped);
    },
    [onIndexChange, reels.length]
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={{ height: reelHeight, width: reelWidth }}
      contentContainerStyle={{ flexGrow: 0 }}
      pagingEnabled
      snapToInterval={reelHeight}
      snapToAlignment="start"
      decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.92}
      // One reel per fling — matches TikTok and stops Android over-scrolling pages.
      disableIntervalMomentum
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
      nestedScrollEnabled
      directionalLockEnabled
      scrollEventThrottle={16}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      removeClippedSubviews={false}
    >
      {reels.map((item, index) => (
        <View
          key={item.id}
          style={{ height: reelHeight, width: reelWidth }}
          collapsable={false}
          pointerEvents="box-none"
        >
          {Math.abs(index - currentIndex) <= 2 ? (
            <>
              <ReelPageMedia
                item={item}
                index={index}
                currentIndex={currentIndex}
                reelWidth={reelWidth}
                reelHeight={reelHeight}
                isFocused={isFocused}
                mediaShouldPlay={mediaShouldPlay}
                isMuted={isMuted}
                volume={volume}
                isReady={readyReelIds.has(item.id)}
                videoUri={resolveUri(item)}
                onReady={onReady}
                onPlaybackStatus={onPlaybackStatus}
                onRef={onRef}
                onMediaIndexChange={onMediaIndexChange}
                showEndScreen={endScreenReelId === item.id}
              />
              <ReelVideoTapLayer onPress={() => onVideoPress(item)} />
            </>
          ) : (
            <View style={[styles.placeholder, { height: reelHeight, width: reelWidth }]} />
          )}
        </View>
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#000' },
});
