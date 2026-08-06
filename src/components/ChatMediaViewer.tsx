import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Modal,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ChatVideoPlayer } from './ChatVideoPlayer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { allowViewOnceCapture, preventViewOnceCapture } from '../lib/screenCaptureGuard';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VIDEO_FRAME = { width: SCREEN_W, height: SCREEN_H };
const AnimatedImage = Animated.createAnimatedComponent(Image);

export type ChatMediaItem = {
  id: string;
  type: 'image' | 'video';
  uri: string;
  senderName?: string;
  createdAt?: string;
  /** Shown only inside the viewer (e.g. view-once captions). */
  caption?: string;
  viewOnce?: boolean;
  /** Auto-close after N seconds while viewing view-once media. */
  autoCloseSec?: number | null;
};

type Props = {
  items: ChatMediaItem[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
};

/** Own loading state so parent FlatList does not re-render on every image load event. */
const MediaImageSlide = React.memo(function MediaImageSlide({
  uri,
  onZoomChange,
}: {
  uri: string;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const safeUri = typeof uri === 'string' ? uri.trim() : '';
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  useEffect(() => {
    setLoading(true);
    setFailed(!safeUri);
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
    onZoomChange?.(false);
  }, [safeUri]);

  const notifyZoom = (z: boolean) => {
    onZoomChange?.(z);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(4, Math.max(1, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(notifyZoom)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(notifyZoom)(true);
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (savedScale.value <= 1.05 && scale.value <= 1.05) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(notifyZoom)(false);
      } else {
        scale.value = withTiming(2.2);
        savedScale.value = 2.2;
        runOnJS(notifyZoom)(true);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  if (!safeUri) {
    return (
      <View style={styles.mediaFrame}>
        <View style={styles.failed}>
          <Ionicons name="image-outline" size={48} color="#666" />
          <Text style={styles.failedText}>Could not load image</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mediaFrame}>
      {loading && !failed ? (
        <ActivityIndicator style={styles.loader} size="large" color="#fff" />
      ) : null}
      {failed ? (
        <View style={styles.failed}>
          <Ionicons name="image-outline" size={48} color="#666" />
          <Text style={styles.failedText}>Could not load image</Text>
        </View>
      ) : (
        <GestureDetector gesture={gesture}>
          <AnimatedImage
            source={{ uri: safeUri }}
            style={[styles.image, animatedStyle]}
            resizeMode="contain"
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
          />
        </GestureDetector>
      )}
    </View>
  );
});

const MediaVideoSlide = React.memo(function MediaVideoSlide({
  uri,
  active,
}: {
  uri: string;
  active: boolean;
}) {
  if (!active) {
    return (
      <View style={[styles.mediaFrame, styles.videoPlaceholder]}>
        <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.5)" />
      </View>
    );
  }
  return (
    <View style={styles.mediaFrame}>
      <ChatVideoPlayer uri={uri} previewMode style={VIDEO_FRAME} />
    </View>
  );
});

export function ChatMediaViewer({ items, initialIndex, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMediaItem>>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex);
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, initialIndex]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [visible]);

  // Block screenshots / screen recording while any view-once item is open.
  const guardViewOnce = visible && items.some((item) => item.viewOnce);
  useEffect(() => {
    if (!guardViewOnce) return;
    void preventViewOnceCapture();
    return () => {
      void allowViewOnceCapture();
    };
  }, [guardViewOnce]);

  // Timed view-once: live countdown + auto-close after the selected window.
  const autoCloseSec = visible
    ? items[index]?.autoCloseSec ?? items[initialIndex]?.autoCloseSec ?? null
    : null;
  const [closeInSec, setCloseInSec] = useState<number | null>(null);
  useEffect(() => {
    if (!visible || !guardViewOnce) {
      setCloseInSec(null);
      return;
    }
    if (autoCloseSec == null || autoCloseSec <= 0) {
      setCloseInSec(null);
      return;
    }
    setCloseInSec(autoCloseSec);
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const remaining = Math.max(0, autoCloseSec - Math.floor((Date.now() - startedAt) / 1000));
      setCloseInSec(remaining);
      if (remaining <= 0) {
        clearInterval(tick);
        onClose();
      }
    }, 250);
    return () => clearInterval(tick);
  }, [visible, guardViewOnce, autoCloseSec, onClose, index]);

  const onScrollEnd = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setIndex((prev) => (prev === next ? prev : next));
  }, []);

  const renderItem = useCallback(
    ({ item, index: itemIndex }: { item: ChatMediaItem; index: number }) => (
      <View style={styles.page}>
        {item.type === 'image' ? (
          <MediaImageSlide uri={item.uri} onZoomChange={setZoomed} />
        ) : (
          <MediaVideoSlide uri={item.uri} active={itemIndex === index} />
        )}
      </View>
    ),
    [index]
  );

  if (!visible || items.length === 0) return null;

  const current = items[index] ?? items[0];

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          style={styles.list}
          data={items}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({
            length: SCREEN_W,
            offset: SCREEN_W * i,
            index: i,
          })}
          onMomentumScrollEnd={onScrollEnd}
          extraData={`${index}:${zoomed ? 1 : 0}`}
          renderItem={renderItem}
        />

        <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            {current.senderName ? (
              <Text style={styles.sender} numberOfLines={1}>
                {current.senderName}
              </Text>
            ) : null}
            {current.createdAt ? (
              <Text style={styles.date}>{formatTime(current.createdAt)}</Text>
            ) : null}
          </View>
          <Text style={styles.counter}>
            {index + 1} / {items.length}
          </Text>
        </View>

        {(current.caption || current.viewOnce || items.length > 1 || current.type === 'image') && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            {current.caption ? (
              <Text style={styles.caption} numberOfLines={6}>
                {current.caption}
              </Text>
            ) : null}
            {current.viewOnce ? (
              <Text style={styles.footerHint}>
                View once · screenshots blocked
                {closeInSec != null
                  ? ` · closes in ${closeInSec}s`
                  : current.autoCloseSec
                    ? ` · closes in ${current.autoCloseSec}s`
                    : ' · closes when you leave'}
              </Text>
            ) : items.length > 1 ? (
              <Text style={styles.footerHint}>
                Swipe to view more
                {current.type === 'image' ? ' · pinch to zoom' : ''}
              </Text>
            ) : current.type === 'image' ? (
              <Text style={styles.footerHint}>Pinch or double-tap to zoom</Text>
            ) : null}
          </View>
        )}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  list: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  headerBtn: {
    padding: 4,
    width: 44,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  sender: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  date: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  counter: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    width: 44,
    textAlign: 'right',
  },
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  mediaFrame: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholder: {
    backgroundColor: '#111',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loader: {
    position: 'absolute',
    zIndex: 1,
  },
  failed: {
    alignItems: 'center',
    gap: 8,
  },
  failedText: {
    color: '#888',
    fontSize: 14,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    paddingHorizontal: 20,
    gap: 6,
  },
  caption: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  footerHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
});
