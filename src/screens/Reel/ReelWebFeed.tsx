import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ReelDTO } from '../../lib/api';
import { markReelWebSwipe } from './reelWebSwipeGate';

export type ReelWebFeedHandle = {
  scrollToIndex: (index: number, animated?: boolean) => void;
};

type Props = {
  reels: ReelDTO[];
  currentIndex: number;
  /** Video frame width. */
  reelWidth: number;
  /** Full page width (video + desktop action gutter when present). */
  feedWidth: number;
  reelHeight: number;
  renderItem: (info: { item: ReelDTO; index: number }) => React.ReactElement | null;
  onIndexChange: (index: number) => void;
  onEndReached?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  ListEmptyComponent?: React.ReactElement | null;
};

/**
 * Mobile Chrome cannot pan RN FlatList (overflow:hidden + JS offset).
 * This uses a real overflow:scroll + CSS scroll-snap container so the
 * browser owns the vertical gesture.
 *
 * feedWidth must include desktopActionOffset so the engagement rail is not clipped.
 */
export const ReelWebFeed = forwardRef<ReelWebFeedHandle, Props>(function ReelWebFeed(
  {
    reels,
    currentIndex,
    reelWidth,
    feedWidth,
    reelHeight,
    renderItem,
    onIndexChange,
    onEndReached,
    refreshing = false,
    onRefresh,
    ListEmptyComponent,
  },
  ref
) {
  const scrollerRef = useRef<View>(null);
  const heightRef = useRef(reelHeight);
  heightRef.current = reelHeight;
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;
  const [pullPx, setPullPx] = useState(0);
  const pageWidth = Math.max(reelWidth, feedWidth);

  const getEl = () => scrollerRef.current as unknown as HTMLElement | null;

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number, animated = true) => {
      const el = getEl();
      if (!el) return;
      const top = Math.max(0, index) * heightRef.current;
      el.scrollTo({ top, behavior: animated ? 'smooth' : 'auto' });
    },
  }));

  useEffect(() => {
    const el = getEl();
    if (!el) return;

    // Force real CSS scroll — RN-web style flattening can drop overflowY/snap.
    el.style.overflowY = 'scroll';
    el.style.overflowX = 'hidden';
    el.style.scrollSnapType = 'y mandatory';
    el.style.setProperty('-webkit-overflow-scrolling', 'touch');
    el.style.touchAction = 'pan-y';
    el.style.overscrollBehavior = 'contain';
    (el.style as CSSStyleDeclaration & { scrollbarWidth?: string }).scrollbarWidth = 'none';

    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const applyIndexFromScroll = () => {
      const h = heightRef.current;
      if (h <= 0) return;
      const raw = Math.round(el.scrollTop / h);
      const next = Math.max(0, Math.min(reels.length - 1, raw));
      if (next !== indexRef.current) {
        indexRef.current = next;
        onIndexChange(next);
      }
      if (next >= reels.length - 4) onEndReached?.();
    };

    const onScroll = () => {
      markReelWebSwipe();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        applyIndexFromScroll();
        const h = heightRef.current;
        if (h <= 0) return;
        const target = Math.round(el.scrollTop / h) * h;
        if (Math.abs(el.scrollTop - target) > 2) {
          el.scrollTo({ top: target, behavior: 'smooth' });
        }
      }, 80);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [onEndReached, onIndexChange, reels.length]);

  // Pull-down on the first reel to fetch newer posts (web has no RefreshControl).
  useEffect(() => {
    const el = getEl();
    if (!el || !onRefresh) return;

    let startY = 0;
    let pulling = false;

    const onTouchStart = (e: TouchEvent) => {
      if (indexRef.current !== 0 || refreshingRef.current) return;
      if (el.scrollTop > 2) return;
      startY = e.touches[0]?.clientY ?? 0;
      pulling = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling || indexRef.current !== 0) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = Math.max(0, y - startY);
      if (delta > 8 && el.scrollTop <= 0) {
        setPullPx(Math.min(88, delta * 0.45));
      } else if (delta <= 8) {
        setPullPx(0);
      }
    };

    const onTouchEnd = () => {
      if (!pulling) return;
      pulling = false;
      setPullPx((prev) => {
        if (prev >= 36 && !refreshingRef.current) {
          void onRefreshRef.current?.();
        }
        return 0;
      });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onRefresh, reels.length]);

  if (reels.length === 0) {
    return ListEmptyComponent ?? null;
  }

  const showPullHint = refreshing || pullPx > 12;

  return (
    <View style={{ height: reelHeight, width: pageWidth }}>
      {showPullHint ? (
        <View style={[styles.pullHint, { height: refreshing ? 36 : Math.max(28, pullPx * 0.5) }]}>
          {refreshing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.pullHintText}>
              {pullPx >= 36 ? 'Release for newer reels' : 'Pull for newer reels'}
            </Text>
          )}
        </View>
      ) : null}
    <View
      ref={scrollerRef}
      style={[
        styles.scroller,
        {
          height: reelHeight,
          width: pageWidth,
        },
      ]}
      // @ts-expect-error RN-web scroll DOM attrs
      tabIndex={0}
    >
      {reels.map((item, index) => (
        <View
          key={item.id}
          style={[
            styles.page,
            {
              height: reelHeight,
              width: pageWidth,
            },
          ]}
          collapsable={false}
          // @ts-expect-error web-only
          dataSet={{ reelPage: '1' }}
          ref={(pageRef) => {
            const pageEl = pageRef as unknown as HTMLElement | null;
            if (!pageEl?.style) return;
            pageEl.style.scrollSnapAlign = 'start';
            pageEl.style.scrollSnapStop = 'always';
            pageEl.style.height = `${reelHeight}px`;
            pageEl.style.width = `${pageWidth}px`;
            pageEl.style.flexShrink = '0';
          }}
        >
          {Math.abs(index - currentIndex) <= 2 ? (
            renderItem({ item, index })
          ) : (
            <View style={{ height: reelHeight, width: pageWidth, backgroundColor: '#000' }} />
          )}
        </View>
      ))}
    </View>
    </View>
  );
});

const styles = StyleSheet.create({
  pullHint: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pullHintText: { color: '#fff', fontSize: 12, fontWeight: '600', opacity: 0.9 },
  scroller: {
    overflowY: 'scroll',
    overflowX: 'hidden',
    // @ts-expect-error web-only CSS
    scrollSnapType: 'y mandatory',
    // @ts-expect-error web-only CSS
    WebkitOverflowScrolling: 'touch',
    // @ts-expect-error web-only CSS
    touchAction: 'pan-y',
    // @ts-expect-error web-only CSS
    overscrollBehavior: 'contain',
    // @ts-expect-error web-only CSS
    scrollbarWidth: 'none',
  } as object,
  page: {
    // @ts-expect-error web-only CSS
    scrollSnapAlign: 'start',
    // @ts-expect-error web-only CSS
    scrollSnapStop: 'always',
  } as object,
});
