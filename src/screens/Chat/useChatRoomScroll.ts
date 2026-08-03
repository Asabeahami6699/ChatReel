import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { FlatList } from 'react-native';

type Options = {
  messageCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  initialLoadComplete: boolean;
};

export function useChatRoomScroll({
  messageCount,
  hasMore,
  loadingMore,
  initialLoadComplete,
}: Options) {
  const flatListRef = useRef<FlatList>(null);
  const shouldStickToBottomRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const didInitialScrollRef = useRef(false);

  const [showScrollDown, setShowScrollDown] = useState(false);
  const [nearTop, setNearTop] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollToBottom = useCallback((animated = true) => {
    const list = flatListRef.current;
    if (!list) return;
    list.scrollToEnd?.({ animated });
    if (Platform.OS === 'web') {
      requestAnimationFrame(() => {
        list.scrollToEnd?.({ animated: false });
      });
    }
  }, []);

  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      // Stick only when truly near the latest message — avoids yanking back while reading history.
      const nearBottom = distanceFromBottom < 72;

      shouldStickToBottomRef.current = nearBottom;
      setShowScrollDown((prev) => {
        const next = !nearBottom && messageCount > 0;
        return prev === next ? prev : next;
      });

      // WhatsApp-style: do NOT auto-fetch older messages on scroll.
      // Older history loads only when the user pulls to refresh at the top.
      const atTop = contentOffset.y <= 24;
      setNearTop((prev) => (prev === atTop ? prev : atTop));
      if (atTop && hasMore && !loadingMore && initialLoadComplete) {
        shouldStickToBottomRef.current = false;
      }
    },
    [messageCount, hasMore, loadingMore, initialLoadComplete]
  );

  const onContentSizeChange = useCallback(
    (_w: number, _h: number) => {
      if (loadingMoreRef.current) return;
      if (shouldStickToBottomRef.current) {
        scrollToBottom(false);
      }
    },
    [scrollToBottom]
  );

  const onListLayout = useCallback(() => {
    if (
      initialLoadComplete &&
      shouldStickToBottomRef.current &&
      !didInitialScrollRef.current
    ) {
      didInitialScrollRef.current = true;
      scrollToBottom(false);
    }
  }, [initialLoadComplete, scrollToBottom]);

  const scrollToBottomAndStick = useCallback(() => {
    shouldStickToBottomRef.current = true;
    scrollToBottom(true);
  }, [scrollToBottom]);

  const stickBeforeSend = useCallback(() => {
    shouldStickToBottomRef.current = true;
  }, []);

  const resetForChat = useCallback(() => {
    shouldStickToBottomRef.current = true;
    didInitialScrollRef.current = false;
    loadingMoreRef.current = false;
    setNearTop(false);
  }, []);

  const beginLoadMore = useCallback(() => {
    shouldStickToBottomRef.current = false;
    loadingMoreRef.current = true;
  }, []);

  const endLoadMore = useCallback(() => {
    loadingMoreRef.current = false;
  }, []);

  useEffect(() => {
    if (!initialLoadComplete || loadingMore) return;
    if (!shouldStickToBottomRef.current) return;

    const timer = setTimeout(() => {
      if (shouldStickToBottomRef.current && !loadingMoreRef.current) {
        scrollToBottom(false);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [messageCount, initialLoadComplete, loadingMore, scrollToBottom]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      // Only follow the keyboard when already at the latest messages.
      if (shouldStickToBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom(true));
        setTimeout(() => {
          if (shouldStickToBottomRef.current) scrollToBottom(true);
        }, 250);
      }
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

  return {
    flatListRef,
    showScrollDown,
    nearTop,
    isKeyboardVisible,
    keyboardHeight,
    shouldStickToBottomRef,
    scrollToBottom,
    scrollToBottomAndStick,
    stickBeforeSend,
    handleScroll,
    onContentSizeChange,
    onListLayout,
    resetForChat,
    beginLoadMore,
    endLoadMore,
    loadingMoreRef,
  };
}
