import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { USE_NATIVE_DRIVER } from '../../lib/animation';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import type { ReelPlayerHandle, ReelPlaybackStatus } from '../../components/ReelPlayer';
import { ReelFeedMedia } from './ReelFeedMedia';
import ReelCommentSheet from './ReelCommentSheet';
import ReelShareSheet from './ReelShareSheet';
import ReelProfileSheet from './ReelProfileSheet';
import { useReelVideoPrefetch } from './useReelVideoPrefetch';
import { markReelWatched } from './reelVideoCache';
import { REEL_ACTION_RAIL_RIGHT, REEL_ACTION_RAIL_WIDTH, REEL_BOTTOM_INSET, REEL_PHONE_MAX_WIDTH, REEL_PROGRESS_BAR_HEIGHT, getReelFrameDimensions } from './reelVideoLayout';
import { ExpandableCaption } from './ExpandableCaption';
import { ReelSoundStrip } from './ReelSoundStrip';
import { ReelVideoTapLayer } from './ReelVideoTapLayer';
import { ReelBrandBadge } from './ReelBrandBadge';
import { ReelEndScreen } from './ReelEndScreen';
import { REEL_ACCENT, REEL_END_SCREEN_MS, reelBottomLayout } from './reelTheme';
import { registerReelFeedPauseHandler, useReelPlaybackGateActive } from '../../lib/reelPlaybackBridge';

type Props = {
  reels: ReelDTO[];
  initialIndex?: number;
  onClose: () => void;
  onReelsChange?: (reels: ReelDTO[]) => void;
  /** When true, avatar/username are not tappable (e.g. viewing from a profile grid). */
  disableProfileNavigation?: boolean;
};

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0K', 'K');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

function authorLabel(reel: ReelDTO): string {
  return reel.author?.display_name?.trim() || reel.author?.email?.split('@')[0] || 'unknown';
}

export function ReelImmersiveViewer({
  reels: initialReels,
  initialIndex = 0,
  onClose,
  onReelsChange,
  disableProfileNavigation = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { frameWidth: reelWidth, frameHeight: reelHeight, usePhoneFrame, desktopActionOffset } = useMemo(
    () => getReelFrameDimensions(windowWidth, windowHeight),
    [windowWidth, windowHeight]
  );
  const [reels, setReels] = useState(initialReels);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [readyReelIds, setReadyReelIds] = useState<Set<string>>(new Set());
  const [openComments, setOpenComments] = useState<ReelDTO | null>(null);
  const [openShare, setOpenShare] = useState<ReelDTO | null>(null);
  const [openProfile, setOpenProfile] = useState<ReelDTO | null>(null);

  const gateActive = useReelPlaybackGateActive();
  const sheetOpen = Boolean(openComments || openShare || openProfile);
  const mediaShouldPlay = isPlaying && !sheetOpen && !gateActive;
  const mediaShouldPlayRef = useRef(mediaShouldPlay);
  mediaShouldPlayRef.current = mediaShouldPlay;
  const canAutoplayRef = useRef(false);
  canAutoplayRef.current = !sheetOpen && !gateActive;

  const [endScreenReelId, setEndScreenReelId] = useState<string | null>(null);
  const [badgePlayCycle, setBadgePlayCycle] = useState(0);
  const endScreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { progressBottom, metaBottom } = reelBottomLayout(insets.bottom);

  const flatListRef = useRef<FlatList<ReelDTO>>(null);
  const pagerRef = useRef<PagerView>(null);
  const feedClipRef = useRef<View>(null);
  const wheelLockRef = useRef(false);
  const scrollAnchorIndexRef = useRef(0);
  const isSnappingRef = useRef(false);
  const currentIndexRef = useRef(initialIndex);
  const reelHeightRef = useRef(reelHeight);
  reelHeightRef.current = reelHeight;
  currentIndexRef.current = currentIndex;
  const videos = useRef<Record<string, ReelPlayerHandle | null>>({});
  const activeReelIdRef = useRef<string | null>(null);
  const activeMediaIndexRef = useRef<Record<string, number>>({});
  const durationMillisRef = useRef(1);
  const isScrubbingRef = useRef(false);
  const viewedReelIds = useRef<Set<string>>(new Set());
  const reelsRef = useRef(reels);
  reelsRef.current = reels;

  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const tapCount = useRef(0);
  const lastTap = useRef(0);

  const { resolveUri, prefetchAround } = useReelVideoPrefetch(activeReelIdRef);

  const patchReel = useCallback(
    (id: string, patch: Partial<ReelDTO>) => {
      setReels((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
        onReelsChange?.(next);
        return next;
      });
    },
    [onReelsChange]
  );

  const activePlayerKey = useCallback((reelId: string | null) => {
    if (!reelId) return null;
    const slideIndex = activeMediaIndexRef.current[reelId] ?? 0;
    const slideKey = `${reelId}:${slideIndex}`;
    if (videos.current[slideKey]) return slideKey;
    if (videos.current[reelId]) return reelId;
    return slideKey;
  }, []);

  const getActivePlayer = useCallback(
    (reelId: string | null) => {
      const key = activePlayerKey(reelId);
      return key ? videos.current[key] ?? null : null;
    },
    [activePlayerKey]
  );

  const registerVideoRef = useCallback((reelId: string, ref: ReelPlayerHandle | null) => {
    if (ref) videos.current[reelId] = ref;
    else delete videos.current[reelId];
  }, []);

  useEffect(() => {
    return () => {
      if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
    };
  }, []);

  const pausePlayers = useCallback(async () => {
    await Promise.all(
      Object.values(videos.current).map(async (player) => {
        if (!player) return;
        try {
          await player.pauseAsync();
        } catch {
          /* ignore */
        }
      })
    );
  }, []);

  const pauseAllVideos = useCallback(async () => {
    await pausePlayers();
    setIsPlaying(false);
  }, [pausePlayers]);

  const openSheet = useCallback(
    (setter: (reel: ReelDTO) => void, reel: ReelDTO) => {
      void pausePlayers();
      setter(reel);
    },
    [pausePlayers]
  );

  const closeSheets = useCallback(() => {
    setOpenComments(null);
    setOpenShare(null);
    setOpenProfile(null);
  }, []);

  useEffect(() => {
    const unregisterPause = registerReelFeedPauseHandler(() => {
      void pauseAllVideos();
    });
    return () => unregisterPause();
  }, [pauseAllVideos]);

  const playActiveReel = useCallback(async (reelId: string | null, shouldPlay?: boolean) => {
    const wantPlay = shouldPlay ?? mediaShouldPlayRef.current;
    activeReelIdRef.current = reelId;
    const slideIndex = reelId ? (activeMediaIndexRef.current[reelId] ?? 0) : 0;
    const activeSlideKey = reelId ? `${reelId}:${slideIndex}` : null;
    await Promise.all(
      Object.entries(videos.current).map(async ([id, player]) => {
        if (!player) return;
        try {
          const isActive =
            reelId != null && (id === reelId || id === activeSlideKey || id.startsWith(`${reelId}:`));
          if (isActive && (id === reelId || id === activeSlideKey)) {
            if (wantPlay) {
              const status = await player.getStatusAsync();
              if (status.isLoaded) await player.playAsync();
            } else {
              await player.pauseAsync();
            }
          } else {
            await player.pauseAsync();
          }
        } catch {
          /* ignore */
        }
      })
    );
  }, []);

  const playActiveReelRef = useRef(playActiveReel);
  playActiveReelRef.current = playActiveReel;

  const seekToProgress = useCallback(
    (ratio: number) => {
      const player = getActivePlayer(activeReelIdRef.current);
      if (!player) return;
      const duration = durationMillisRef.current || 1;
      const clamped = Math.max(0, Math.min(1, ratio));
      void player.setPositionAsync(clamped * duration);
      setProgress(clamped);
    },
    [getActivePlayer]
  );

  const progressPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderGrant: (_, gesture) => {
          isScrubbingRef.current = true;
          void getActivePlayer(activeReelIdRef.current)?.pauseAsync();
          setIsPlaying(false);
          seekToProgress(gesture.x0 / reelWidth);
        },
        onPanResponderMove: (_, gesture) => seekToProgress(gesture.moveX / reelWidth),
        onPanResponderRelease: () => {
          isScrubbingRef.current = false;
          void getActivePlayer(activeReelIdRef.current)?.playAsync();
          setIsPlaying(true);
        },
        onPanResponderTerminate: () => {
          isScrubbingRef.current = false;
        },
      }),
    [reelWidth, seekToProgress, getActivePlayer]
  );

  const animateHeart = useCallback(() => {
    heartScale.setValue(0);
    heartOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(heartScale, { toValue: 1.3, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(heartOpacity, { toValue: 1, duration: 100, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(heartScale, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(heartOpacity, { toValue: 0, duration: 400, useNativeDriver: USE_NATIVE_DRIVER }),
        ]).start();
      }, 300);
    });
  }, [heartOpacity, heartScale]);

  const toggleLike = useCallback(
    async (reel: ReelDTO, viaDoubleTap = false) => {
      const next = !reel.liked_by_me;
      patchReel(reel.id, {
        liked_by_me: next,
        like_count: Math.max(0, reel.like_count + (next ? 1 : -1)),
      });
      if (next || viaDoubleTap) animateHeart();
      try {
        if (next) await api.reels.like(reel.id);
        else await api.reels.unlike(reel.id);
      } catch (e) {
        patchReel(reel.id, { liked_by_me: !next, like_count: reel.like_count });
        Alert.alert('Reels', e instanceof ApiError ? e.message : 'Failed to update like');
      }
    },
    [animateHeart, patchReel]
  );

  const handlePlaybackStatus = useCallback((reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => {
    if (!status.isLoaded || !isCurrent) return;
    if (status.didJustFinish) {
      const key = activePlayerKey(reelId);
      void (key ? videos.current[key] : null)?.pauseAsync();

      const list = reelsRef.current;
      const idx = list.findIndex((r) => r.id === reelId);
      const finished = idx >= 0 ? list[idx] : null;
      if (finished?.visibility === 'group' && finished.group_id) {
        const nextGroupIdx = list.findIndex(
          (r, i) =>
            i > idx && r.visibility === 'group' && r.group_id === finished.group_id
        );
        if (nextGroupIdx >= 0) {
          setEndScreenReelId(null);
          setProgress(0);
          setIsPlaying(true);
          flatListRef.current?.scrollToIndex({ index: nextGroupIdx, animated: true });
          return;
        }
      }

      setEndScreenReelId(reelId);
      if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
      endScreenTimerRef.current = setTimeout(() => {
        setEndScreenReelId((cur) => (cur === reelId ? null : cur));
        setBadgePlayCycle((c) => c + 1);
        const replayKey = activePlayerKey(reelId);
        setIsPlaying(true);
        void (replayKey ? videos.current[replayKey] : null)?.replayAsync();
      }, REEL_END_SCREEN_MS);
      return;
    }
    if (status.positionMillis != null && status.durationMillis != null && status.durationMillis > 0) {
      if (!isScrubbingRef.current) setProgress(status.positionMillis / status.durationMillis);
      durationMillisRef.current = status.durationMillis;
    }
  }, [activePlayerKey]);

  const handleVideoReady = useCallback(
    (reelId: string) => {
      setReadyReelIds((prev) => (prev.has(reelId) ? prev : new Set(prev).add(reelId)));
      if (reelId === activeReelIdRef.current) void playActiveReel(reelId);
    },
    [playActiveReel]
  );

  const togglePlayPause = useCallback(async () => {
    const v = getActivePlayer(activeReelIdRef.current);
    if (v) {
      if (isPlaying) await v.pauseAsync();
      else await v.playAsync();
    }
    setIsPlaying((p) => !p);
  }, [getActivePlayer, isPlaying]);

  const handleVideoPress = useCallback(
    (reel: ReelDTO) => {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        tapCount.current += 1;
        if (tapCount.current === 2) {
          if (!reel.liked_by_me) void toggleLike(reel, true);
          else animateHeart();
          tapCount.current = 0;
        }
      } else {
        tapCount.current = 1;
      }
      lastTap.current = now;
      setTimeout(() => {
        if (tapCount.current === 1) void togglePlayPause();
        tapCount.current = 0;
      }, 300);
    },
    [animateHeart, toggleLike, togglePlayPause]
  );

  useEffect(() => {
    if (initialIndex > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 50);
    }
  }, [initialIndex]);

  useEffect(() => {
    if (sheetOpen || gateActive) {
      void pausePlayers();
    } else if (isPlaying && activeReelIdRef.current) {
      void playActiveReel(activeReelIdRef.current);
    }
  }, [sheetOpen, gateActive, isPlaying, pausePlayers, playActiveReel]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null; item: ReelDTO }[] }) => {
      if (viewableItems.length === 0) return;
      const candidates = viewableItems
        .filter((v) => v.index != null && v.item?.id)
        .map((v) => ({ index: v.index as number, item: v.item }));
      if (candidates.length === 0) return;

      const prevIndex = currentIndexRef.current;
      const desiredIndex = candidates.reduce((best, c) => {
        return Math.abs(c.index - prevIndex) > Math.abs(best.index - prevIndex) ? c : best;
      }, candidates[0]).index;
      const rawDelta = desiredIndex - prevIndex;
      const delta = Math.abs(rawDelta) <= 1 ? rawDelta : Math.sign(rawDelta);
      const nextIndex = Math.max(
        0,
        Math.min(
          reelsRef.current.length - 1,
          candidates.length === 1 ? desiredIndex : prevIndex + delta
        )
      );
      const reel = reelsRef.current[nextIndex] ?? candidates.find((c) => c.index === nextIndex)?.item;
      if (!reel?.id) return;

      const prevId = activeReelIdRef.current;
      activeReelIdRef.current = reel.id;
      setCurrentIndex(nextIndex);
      setProgress(0);
      setEndScreenReelId(null);
      if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
      if (prevId !== reel.id) setBadgePlayCycle((c) => c + 1);
      const shouldAutoplay = canAutoplayRef.current;
      if (shouldAutoplay) {
        setIsPlaying(true);
      }
      void playActiveReelRef.current(reel.id, shouldAutoplay);
      if (!viewedReelIds.current.has(reel.id)) {
        viewedReelIds.current.add(reel.id);
        markReelWatched(reel.id);
        api.reels.view(reel.id).catch(() => undefined);
        setReels((prev) =>
          prev.map((r) => (r.id === reel.id ? { ...r, view_count: r.view_count + 1 } : r))
        );
      }
      prefetchAround(reelsRef.current, nextIndex);
    }
  ).current;

  const snapToAdjacentReel = useCallback((offsetY: number) => {
    const h = reelHeightRef.current;
    if (h <= 0) return;
    const reelsLen = reelsRef.current.length;
    if (reelsLen <= 0) return;
    const rawIndex = Math.round(offsetY / h);
    const anchor = scrollAnchorIndexRef.current;
    const clamped = Math.max(anchor - 1, Math.min(anchor + 1, rawIndex));
    const target = Math.max(0, Math.min(reelsLen - 1, clamped));
    const targetOffset = target * h;
    if (Math.abs(offsetY - targetOffset) > 2 || target !== rawIndex) {
      isSnappingRef.current = true;
      flatListRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
      requestAnimationFrame(() => {
        isSnappingRef.current = false;
      });
    }
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    scrollAnchorIndexRef.current = currentIndexRef.current;
  }, []);

  const onMomentumScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      if (isSnappingRef.current) return;
      snapToAdjacentReel(e.nativeEvent.contentOffset.y);
    },
    [snapToAdjacentReel]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const node = feedClipRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 10) return;
      e.preventDefault();
      e.stopPropagation();
      if (wheelLockRef.current || isSnappingRef.current) return;
      const h = reelHeightRef.current;
      if (h <= 0) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const from = currentIndexRef.current;
      const target = Math.max(0, Math.min(reelsRef.current.length - 1, from + dir));
      if (target === from) return;
      scrollAnchorIndexRef.current = from;
      wheelLockRef.current = true;
      isSnappingRef.current = true;
      flatListRef.current?.scrollToOffset({ offset: target * h, animated: true });
      window.setTimeout(() => {
        isSnappingRef.current = false;
        wheelLockRef.current = false;
      }, 420);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [reelHeight, reels.length]);

  const onUseReelAudio = useCallback(
    (reel: ReelDTO) => {
      if (reel.sound?.id) {
        navigation.navigate('ReelSound', { soundId: reel.sound.id });
        return;
      }
      navigation.navigate('ReelSound', { fromReelId: reel.id });
    },
    [navigation]
  );

  const renderReel = useCallback(
    ({ item, index }: { item: ReelDTO; index: number }) => {
      const isCurrent = index === currentIndex;
      const authorHandle = authorLabel(item);
      const isLiked = item.liked_by_me;

      return (
        <View style={{ width: reelWidth + (usePhoneFrame ? desktopActionOffset : 0), height: reelHeight }}>
          <View style={[styles.videoTouch, usePhoneFrame && { width: reelWidth }]}>
            <ReelFeedMedia
              reel={item}
              reelIndex={index}
              currentReelIndex={currentIndex}
              videoUri={resolveUri(item)}
              frameWidth={reelWidth}
              frameHeight={reelHeight}
              isFocused
              isPlaying={mediaShouldPlay}
              isMuted={isMuted}
              isReady={readyReelIds.has(item.id)}
              onReady={handleVideoReady}
              onPlaybackStatus={handlePlaybackStatus}
              onRef={registerVideoRef}
              onMediaIndexChange={(reelId, mediaIndex) => {
                activeMediaIndexRef.current[reelId] = mediaIndex;
                if (reelId === activeReelIdRef.current) void playActiveReel(reelId);
              }}
            />
            {isCurrent && (
              <Animated.View
                style={[styles.heartAnimation, { transform: [{ scale: heartScale }], opacity: heartOpacity }]}
                pointerEvents="none"
              >
                <Ionicons name="heart" size={100} color={REEL_ACCENT} />
              </Animated.View>
            )}
            {isCurrent && (
              <ReelBrandBadge
                ownerName={authorLabel(item)}
                frameWidth={reelWidth}
                frameHeight={reelHeight}
                progressBottom={progressBottom}
                playCycle={badgePlayCycle}
              />
            )}
            {isCurrent && endScreenReelId === item.id && (
              <ReelEndScreen ownerName={authorLabel(item)} />
            )}
            <ReelVideoTapLayer onPress={() => handleVideoPress(item)} />
          </View>

          <TouchableOpacity
            style={[
              styles.muteButton,
              { top: insets.top + 56 },
              usePhoneFrame
                ? { left: reelWidth + 8, right: undefined }
                : null,
            ]}
            onPress={() => setIsMuted((m) => !m)}
          >
            <Ionicons name={isMuted ? 'volume-mute' : 'volume-medium'} size={22} color="#fff" />
          </TouchableOpacity>

          {isCurrent && (
            <View style={[styles.progressContainer, { bottom: progressBottom }]} {...progressPan.panHandlers}>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            </View>
          )}

          <View style={styles.bottomMeta} pointerEvents="box-none">
            <View style={[styles.captionContainer, { marginBottom: metaBottom, paddingRight: usePhoneFrame ? 8 : REEL_ACTION_RAIL_WIDTH + 8 }]}>
              <View style={styles.userInfo}>
                {disableProfileNavigation ? (
                  <Text style={styles.username}>@{authorLabel(item)}</Text>
                ) : (
                  <TouchableOpacity onPress={() => openSheet(setOpenProfile, item)}>
                    <Text style={styles.username}>@{authorLabel(item)}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!!item.caption && (
                <ExpandableCaption
                  text={item.caption}
                  style={styles.caption}
                  maxLines={3}
                  maxWidth={Math.round(reelWidth * 0.7)}
                />
              )}
              <ReelSoundStrip
                reel={item}
                authorHandle={authorLabel(item)}
                onPressSound={(soundId) => navigation.navigate('ReelSound', { soundId })}
                onPressOriginalAudio={onUseReelAudio}
              />
            </View>
          </View>

          <View
            style={[
              styles.actionButtons,
              { bottom: metaBottom },
              usePhoneFrame && styles.actionButtonsDesktop,
            ]}
          >
            <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item)}>
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={36} color={isLiked ? REEL_ACCENT : '#fff'} />
              <Text style={styles.actionText}>{formatCount(item.like_count)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => openSheet(setOpenComments, item)}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color="#fff" />
              <Text style={styles.actionText}>{formatCount(item.comment_count)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => openSheet(setOpenShare, item)}>
              <Ionicons name="paper-plane-outline" size={32} color="#fff" />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="eye-outline" size={30} color="#fff" />
              <Text style={styles.actionText}>{formatCount(item.view_count)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [
      currentIndex,
      handlePlaybackStatus,
      handleVideoPress,
      handleVideoReady,
      heartOpacity,
      heartScale,
      insets.bottom,
      insets.top,
      isMuted,
      isPlaying,
      playActiveReel,
      progress,
      progressPan.panHandlers,
      readyReelIds,
      reelHeight,
      reelWidth,
      usePhoneFrame,
      desktopActionOffset,
      registerVideoRef,
      resolveUri,
      toggleLike,
      endScreenReelId,
      badgePlayCycle,
      metaBottom,
      progressBottom,
      disableProfileNavigation,
      navigation,
      onUseReelAudio,
    ]
  );

  return (
    <View style={[styles.container, usePhoneFrame && styles.containerPhoneFrame]}>
      <View
        style={[
          styles.feedColumn,
          usePhoneFrame && styles.feedColumnPhone,
          {
            width: usePhoneFrame ? reelWidth + desktopActionOffset : reelWidth,
            height: reelHeight,
          },
        ]}
      >
      <StatusBar barStyle="light-content" />
      <View ref={feedClipRef} style={{ height: reelHeight, width: '100%', overflow: 'hidden' }}>
      {Platform.OS === 'web' ? (
      <FlatList
        ref={flatListRef}
        key={`immersive-feed-${reelHeight}`}
        data={reels}
        style={{ height: reelHeight, overflow: 'hidden' }}
        keyExtractor={(r) => r.id}
        renderItem={renderReel}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        snapToInterval={reelHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        bounces={false}
        initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
        getItemLayout={(_, index) => ({ length: reelHeight, offset: reelHeight * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 51, minimumViewTime: 80 }}
        onScrollBeginDrag={onScrollBeginDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
        }}
      />
      ) : (
        <PagerView
          ref={pagerRef}
          key={`immersive-pager-${reelHeight}`}
          style={{ height: reelHeight, width: '100%' }}
          initialPage={initialIndex > 0 ? initialIndex : 0}
          orientation="vertical"
          offscreenPageLimit={1}
          onPageSelected={(e) => {
            const index = e.nativeEvent.position;
            onViewableItemsChanged({
              viewableItems: [{ index, item: reelsRef.current[index] }],
            });
          }}
        >
          {reels.map((item, index) => (
            <View key={item.id} style={{ height: reelHeight, width: '100%' }} collapsable={false}>
              {renderReel({ item, index })}
            </View>
          ))}
        </PagerView>
      )}
      </View>

      <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 8 }]} onPress={onClose}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>
      </View>

      <Modal visible={!!openComments} animationType="slide" transparent onRequestClose={closeSheets}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheets} />
          <View style={styles.sheet}>
            {openComments && (
              <ReelCommentSheet
                reelId={openComments.id}
                onClose={closeSheets}
                onCommentAdded={() =>
                  patchReel(openComments.id, { comment_count: openComments.comment_count + 1 })
                }
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!openShare} animationType="slide" transparent onRequestClose={closeSheets}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheets} />
          <View style={styles.sheet}>
            {openShare && <ReelShareSheet reel={openShare} onClose={closeSheets} />}
          </View>
        </View>
      </Modal>

      <Modal visible={!!openProfile && !disableProfileNavigation} animationType="slide" transparent onRequestClose={closeSheets}>
        <View style={[styles.sheetBackdrop, usePhoneFrame && styles.sheetBackdropCentered]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheets} />
          <View style={[styles.sheet, usePhoneFrame && styles.profileSheetPhone]}>
            {openProfile && <ReelProfileSheet reel={openProfile} onClose={closeSheets} />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  containerPhoneFrame: {
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedColumn: { flex: 1, alignSelf: 'stretch', overflow: 'hidden' },
  feedColumnPhone: {
    alignSelf: 'center',
    maxWidth: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: '#1f1f1f',
    overflow: 'hidden',
    flex: undefined,
    borderRadius: 16,
  },
  videoTouch: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  closeBtn: {
    position: 'absolute',
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  muteButton: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  muteButtonDesktop: {
    right: 6,
  },
  progressContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 28,
    justifyContent: 'flex-end',
    zIndex: 15,
  },
  progressBg: {
    height: REEL_PROGRESS_BAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: REEL_PROGRESS_BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: REEL_PROGRESS_BAR_HEIGHT / 2,
  },
  bottomMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    paddingHorizontal: 14,
  },
  captionContainer: { paddingHorizontal: 14 },
  userInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarFallback: { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#fff', fontWeight: '700' },
  username: { color: '#fff', fontWeight: '700', fontSize: 15 },
  caption: { color: '#fff', fontSize: 14, lineHeight: 20 },
  musicContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  music: { color: 'rgba(255,255,255,0.85)', fontSize: 12, flex: 1 },
  actionButtons: {
    position: 'absolute',
    right: REEL_ACTION_RAIL_RIGHT,
    alignItems: 'center',
    gap: 10,
    zIndex: 16,
    elevation: 16,
  },
  actionButtonsDesktop: {
    right: 0,
    paddingRight: 4,
  },
  actionButton: { alignItems: 'center', gap: 1 },
  actionText: { color: '#fff', fontSize: 11, marginTop: 2, fontWeight: '600' },
  heartAnimation: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    zIndex: 8,
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetBackdropCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    height: '78%',
    backgroundColor: '#111',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  profileSheetPhone: {
    height: '92%',
    maxHeight: 900,
    width: REEL_PHONE_MAX_WIDTH,
    borderRadius: 16,
    backgroundColor: '#000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1f1f1f',
  },
});
