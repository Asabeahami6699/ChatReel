import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { ReelDTO } from '../../lib/api';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { ReelPageMedia } from './ReelPageMedia';

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
  onEndReached?: () => void;
};

/**
 * Native reel scroller — plain RN ScrollView + pagingEnabled.
 * Pages are video-only (pointerEvents none). No FlatList, no PagerView, no tap wrappers.
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
    onEndReached,
  },
  ref
) {
  const scrollRef = useRef<ScrollView>(null);
  const heightRef = useRef(reelHeight);
  heightRef.current = reelHeight;
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;
  const lockingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number, animated = true) => {
      const h = heightRef.current;
      lockingRef.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(0, index) * h, animated });
      requestAnimationFrame(() => {
        lockingRef.current = false;
      });
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
      const h = heightRef.current;
      if (h <= 0) return;
      const y = e.nativeEvent.contentOffset.y;
      const raw = Math.round(y / h);
      // One page at a time from the drag start index.
      const anchor = indexRef.current;
      const next = Math.max(anchor - 1, Math.min(anchor + 1, raw));
      const clamped = Math.max(0, Math.min(reels.length - 1, next));
      const targetY = clamped * h;
      if (Math.abs(y - targetY) > 1) {
        lockingRef.current = true;
        scrollRef.current?.scrollTo({ y: targetY, animated: true });
        requestAnimationFrame(() => {
          lockingRef.current = false;
        });
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
      decelerationRate="fast"
      disableIntervalMomentum
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
      nestedScrollEnabled={false}
      scrollEventThrottle={16}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      removeClippedSubviews={false}
    >
      {reels.map((item, index) => (
        <View key={item.id} style={{ height: reelHeight, width: reelWidth }} collapsable={false}>
          {/* Only mount nearby pages to keep memory down */}
          {Math.abs(index - currentIndex) <= 2 ? (
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
