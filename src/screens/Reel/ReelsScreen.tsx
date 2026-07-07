import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ProgressBar } from 'react-native-paper';
import { ReelPlayer, type ReelPlaybackStatus, type ReelPlayerHandle } from '../../components/ReelPlayer';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useFocusEffect, useNavigation } from '@react-navigation/native';
import { USE_NATIVE_DRIVER } from '../../lib/animation';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import { useReelsFeed } from '../../hooks/useReelsFeed';
import { useReelUploadQueue } from '../../hooks/useReelUploadQueue';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { retryReelUploadTask } from '../../lib/reelUploadQueue';
import {
  registerBeforeChatNavigate,
  unregisterBeforeChatNavigate,
} from '../../navigation/chatNavigationBridge';
import { navigateMainTab } from '../../navigation/rootNavigation';
import { openPostReelCompose, registerReelFeedPauseHandler, useReelPlaybackGateActive } from '../../lib/reelPlaybackBridge';
import ReelCommentSheet from './ReelCommentSheet';
import ReelShareSheet from './ReelShareSheet';
import ReelProfileSheet from './ReelProfileSheet';
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  REEL_ACTION_RAIL_WIDTH,
  REEL_BOTTOM_INSET,
  REEL_PHONE_MAX_WIDTH,
  getReelFrameDimensions,
} from './reelVideoLayout';
import { useReelVideoPrefetch } from './useReelVideoPrefetch';
import { reelTabBarOffset } from './ReelsTabBar';
import { useReelsMainTabFocused } from '../../context/ReelsMainTabFocusContext';
import { useReelFeedMode } from './ReelFeedModeContext';
import { REEL_ACCENT, REEL_END_SCREEN_MS, reelBottomLayout } from './reelTheme';
import { VolumeControl } from './VolumeControl';
import { ReelFeedRow } from './ReelFeedRow';
import { ReelFeedOverlays } from './ReelFeedOverlays';

const WINDOW_HEIGHT = SCREEN_HEIGHT;
const PROGRESS_UI_MS = 280;

const navArrowStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    top: '50%' as unknown as number,
    marginTop: -52,
    zIndex: 25,
    gap: 8,
    alignItems: 'center',
  },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});

export default function ReelsScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { frameWidth: reelWidth, usePhoneFrame, desktopActionOffset } = useMemo(
    () => getReelFrameDimensions(windowWidth, windowHeight),
    [windowWidth, windowHeight]
  );
  const navigation = useNavigation<any>();
  const isReelTabFocused = useIsFocused();
  const isMainAppTabFocused = useReelsMainTabFocused();
  const isFocused = isReelTabFocused && isMainAppTabFocused;
  const bottomNavOffset = reelTabBarOffset(insets.bottom, usePhoneFrame);
  const reelHeight = Math.max(320, usePhoneFrame
    ? windowHeight - 32
    : windowHeight - bottomNavOffset
  );

  const { feedMode, setFeedMode } = useReelFeedMode();
  const feedSource = feedMode === 'forYou' ? 'feed' : 'following';

  const {
    reels,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    reload,
    applyLocalLikeChange,
    applyLocalCommentChange,
    removeReelLocally,
  } = useReelsFeed(feedSource);
  const { tasks: uploadTasks, activeCount, activeProgress, summary } = useReelUploadQueue();
  const myProfileId = useCurrentProfileId();
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  const flatListRef = useRef<FlatList<ReelDTO>>(null);
  const videos = useRef<Record<string, ReelPlayerHandle | null>>({});
  const activeReelIdRef = useRef<string | null>(null);

  const { resolveUri, prefetchAround, warmReel, clearPins, releasePin } = useReelVideoPrefetch(activeReelIdRef);
  const prefetchAroundRef = useRef(prefetchAround);
  const releasePinRef = useRef(releasePin);
  const reelsRef = useRef(reels);
  prefetchAroundRef.current = prefetchAround;
  releasePinRef.current = releasePin;
  reelsRef.current = reels;

  const activeMediaIndexRef = useRef<Record<string, number>>({});
  const durationMillisRef = useRef(1);
  const isScrubbingRef = useRef(false);
  const progressUiRef = useRef({ progress: 0, buffered: 0, lastEmit: 0 });
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewedReelIds = useRef<Set<string>>(new Set());
  const [readyReelIds, setReadyReelIds] = useState<Set<string>>(new Set());

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [bufferedProgress, setBufferedProgress] = useState(0);
  const [playbackIcon, setPlaybackIcon] = useState<'play' | 'pause' | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const [openComments, setOpenComments] = useState<ReelDTO | null>(null);
  const [openShare, setOpenShare] = useState<ReelDTO | null>(null);
  const [openProfile, setOpenProfile] = useState<ReelDTO | null>(null);

  const gateActive = useReelPlaybackGateActive();
  const sheetOpen = Boolean(openComments || openShare || openProfile);
  const mediaShouldPlay = isPlaying && isFocused && !sheetOpen && !gateActive;
  const mediaShouldPlayRef = useRef(mediaShouldPlay);
  mediaShouldPlayRef.current = mediaShouldPlay;

  const [followedAuthorIds, setFollowedAuthorIds] = useState<Set<string>>(new Set());
  const [followBusyAuthorIds, setFollowBusyAuthorIds] = useState<Set<string>>(new Set());
  const [endScreenReelId, setEndScreenReelId] = useState<string | null>(null);
  const [badgePlayCycle, setBadgePlayCycle] = useState(0);
  const endScreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { progressBottom, metaBottom } = reelBottomLayout();

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

  useFocusEffect(
    useCallback(() => {
      return () => {
        void pauseAllVideos();
      };
    }, [pauseAllVideos])
  );

  useEffect(() => {
    registerBeforeChatNavigate(() => {
      void pauseAllVideos();
    });
    const unregisterPause = registerReelFeedPauseHandler(() => {
      void pauseAllVideos();
    });
    return () => {
      unregisterBeforeChatNavigate();
      unregisterPause();
      if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [pauseAllVideos]);

  useEffect(() => {
    return () => {
      if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
    };
  }, []);

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

  const handleVideoReady = useCallback(
    (reelId: string) => {
      setReadyReelIds((prev) => {
        if (prev.has(reelId)) return prev;
        const next = new Set(prev);
        next.add(reelId);
        return next;
      });
      if (reelId === activeReelIdRef.current && mediaShouldPlayRef.current) {
        const key = activePlayerKey(reelId);
        void (key ? videos.current[key] : null)?.playAsync();
      }
    },
    []
  );

  const scheduleProgressUi = useCallback((nextProgress: number, nextBuffered: number) => {
    progressUiRef.current.progress = nextProgress;
    progressUiRef.current.buffered = nextBuffered;
    const now = Date.now();
    const elapsed = now - progressUiRef.current.lastEmit;
    if (elapsed >= PROGRESS_UI_MS) {
      progressUiRef.current.lastEmit = now;
      setProgress(nextProgress);
      setBufferedProgress(nextBuffered);
      return;
    }
    if (!progressTimerRef.current) {
      progressTimerRef.current = setTimeout(() => {
        progressTimerRef.current = null;
        progressUiRef.current.lastEmit = Date.now();
        setProgress(progressUiRef.current.progress);
        setBufferedProgress(progressUiRef.current.buffered);
      }, PROGRESS_UI_MS - elapsed);
    }
  }, []);

  const handlePlaybackStatus = useCallback(
    (reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => {
      if (!status.isLoaded || !isCurrent) return;
      if (status.didJustFinish) {
        const key = activePlayerKey(reelId);
        void (key ? videos.current[key] : null)?.pauseAsync();
        setEndScreenReelId(reelId);
        if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
        endScreenTimerRef.current = setTimeout(() => {
          setEndScreenReelId((cur) => (cur === reelId ? null : cur));
          setBadgePlayCycle((c) => c + 1);
          const key = activePlayerKey(reelId);
          setIsPlaying(true);
          void (key ? videos.current[key] : null)?.replayAsync();
        }, REEL_END_SCREEN_MS);
        return;
      }
      if (status.durationMillis != null && status.durationMillis > 0) {
        durationMillisRef.current = status.durationMillis;
        if (isScrubbingRef.current) return;
        const buffered =
          status.bufferedMillis != null
            ? Math.min(1, Math.max(0, status.bufferedMillis / status.durationMillis))
            : progressUiRef.current.buffered;
        const nextProgress =
          status.positionMillis != null
            ? status.positionMillis / status.durationMillis
            : progressUiRef.current.progress;
        scheduleProgressUi(nextProgress, buffered);
      }
    },
    [scheduleProgressUi]
  );

  const refreshFollowedAuthors = useCallback(async () => {
    if (!myProfileId) return;
    try {
      const { friendships } = (await api.friendships.list('accepted')) as {
        friendships: Array<{ user_id?: string; friend_id?: string }>;
      };
      const set = new Set<string>();
      for (const f of friendships ?? []) {
        if (f.user_id === myProfileId && f.friend_id) set.add(f.friend_id);
        if (f.friend_id === myProfileId && f.user_id) set.add(f.user_id);
      }
      setFollowedAuthorIds(set);
    } catch {
      /* ignore */
    }
  }, [myProfileId]);


  const resetFeedScroll = useCallback(() => {
    setCurrentIndex(0);
    setProgress(0);
    setBufferedProgress(0);
    progressUiRef.current = { progress: 0, buffered: 0, lastEmit: 0 };
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    clearPins();
    activeReelIdRef.current = null;
    viewedReelIds.current.clear();
    setReadyReelIds(new Set());
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    void Promise.all(Object.values(videos.current).map((v) => v?.pauseAsync()));
  }, [clearPins]);

  const prevFeedModeRef = useRef(feedMode);
  useEffect(() => {
    if (prevFeedModeRef.current !== feedMode) {
      prevFeedModeRef.current = feedMode;
      resetFeedScroll();
    }
  }, [feedMode, resetFeedScroll]);

  const switchFeedMode = useCallback(
    (mode: 'forYou' | 'following') => {
      if (mode === feedMode) return;
      setFeedMode(mode);
    },
    [feedMode, setFeedMode]
  );

  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const tapCount = useRef(0);
  const lastTap = useRef(0);

  const animateHeart = useCallback(() => {
    heartScale.setValue(0);
    heartOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(heartScale, {
        toValue: 1.3,
        duration: 200,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(heartOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(heartScale, {
            toValue: 1.0,
            duration: 200,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(heartOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]).start();
      }, 300);
    });
  }, [heartScale, heartOpacity]);

  const toggleLike = useCallback(
    async (reel: ReelDTO, viaDoubleTap = false) => {
      const next = !reel.liked_by_me;
      // Optimistic
      applyLocalLikeChange(reel.id, next);
      if (next || viaDoubleTap) animateHeart();
      try {
        if (next) await api.reels.like(reel.id);
        else await api.reels.unlike(reel.id);
      } catch (e) {
        applyLocalLikeChange(reel.id, !next);
        const message = e instanceof ApiError ? e.message : 'Failed to update like';
        Alert.alert('Reels', message);
      }
    },
    [applyLocalLikeChange, animateHeart]
  );

  const playActiveReel = useCallback(
    async (reelId: string | null) => {
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
              await player.playAsync();
            } else {
              await player.pauseAsync();
            }
          } catch {
            /* ignore transient av errors */
          }
        })
      );
    },
    []
  );

  const handleMediaIndexChange = useCallback(
    (reelId: string, mediaIndex: number) => {
      activeMediaIndexRef.current[reelId] = mediaIndex;
      if (reelId === activeReelIdRef.current) {
        void playActiveReel(reelId);
      }
    },
    [playActiveReel]
  );

  const onOpenComments = useCallback(
    (reel: ReelDTO) => openSheet(setOpenComments, reel),
    [openSheet]
  );
  const onOpenShare = useCallback((reel: ReelDTO) => openSheet(setOpenShare, reel), [openSheet]);
  const onOpenProfile = useCallback(
    (reel: ReelDTO) => openSheet(setOpenProfile, reel),
    [openSheet]
  );
  const onNavigateSound = useCallback(
    (soundId: string) => navigation.navigate('ReelSound', { soundId }),
    [navigation]
  );

  const goToChats = useCallback(() => {
    void pauseAllVideos();
    navigateMainTab('Chats');
  }, [pauseAllVideos]);

  const handlePullRefresh = useCallback(async () => {
    if (currentIndex !== 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      setCurrentIndex(0);
      setProgress(0);
    }
    await refresh();
    void refreshFollowedAuthors();
    const first = reelsRef.current[0];
    if (first) {
      activeReelIdRef.current = first.id;
      void playActiveReel(first.id);
      setIsPlaying(true);
    }
  }, [currentIndex, refresh, refreshFollowedAuthors, playActiveReel]);

  const togglePlayPause = useCallback(async () => {
    const reelId = activeReelIdRef.current;
    const v = getActivePlayer(reelId);
    if (v) {
      if (isPlaying) {
        await v.pauseAsync();
      } else {
        await v.playAsync();
      }
    }
    setPlaybackIcon(isPlaying ? 'play' : 'pause');
    if (!isPlaying) {
      setTimeout(() => setPlaybackIcon((prev) => (prev === 'pause' ? null : prev)), 700);
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
        if (tapCount.current === 1) {
          void togglePlayPause();
        }
        tapCount.current = 0;
      }, 300);
    },
    [animateHeart, toggleLike, togglePlayPause]
  );

  // Pause when screen blurs, a sheet opens, or a global gate is active.
  useEffect(() => {
    if (!isFocused || sheetOpen || gateActive) {
      void pausePlayers();
      return;
    }
    if (isPlaying && activeReelIdRef.current) {
      void playActiveReel(activeReelIdRef.current);
    }
  }, [isFocused, sheetOpen, gateActive, isPlaying, pausePlayers, playActiveReel]);

  // Keep playback in sync when play state toggles.
  useEffect(() => {
    if (!mediaShouldPlay || !activeReelIdRef.current) return;
    if (isPlaying) {
      void playActiveReel(activeReelIdRef.current);
    } else {
      const v = getActivePlayer(activeReelIdRef.current);
      void v?.pauseAsync();
    }
  }, [isPlaying, mediaShouldPlay, playActiveReel, getActivePlayer]);

  useEffect(() => {
    void refreshFollowedAuthors();
  }, [refreshFollowedAuthors]);

  useEffect(() => {
    if (!isFocused || reels.length === 0) return;
    if (!activeReelIdRef.current) {
      const first = reels[0];
      if (!first) return;
      activeReelIdRef.current = first.id;
      setCurrentIndex(0);
      warmReel(first);
      prefetchAround(reels, 0);
      void playActiveReel(first.id);
      return;
    }
    prefetchAround(reels, currentIndex);
  }, [isFocused, reels, currentIndex, warmReel, prefetchAround, playActiveReel]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null; item: ReelDTO }[] }) => {
      if (viewableItems.length === 0) return;
      const v = viewableItems[0];
      if (v.index == null || !v.item?.id) return;
      const prevId = activeReelIdRef.current;
      setCurrentIndex(v.index);
      setProgress(0);
      setBufferedProgress(0);
      setEndScreenReelId(null);
      if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
      if (prevId !== v.item.id) setBadgePlayCycle((c) => c + 1);
      if (mediaShouldPlayRef.current) {
        setIsPlaying(true);
        setPlaybackIcon(null);
        void playActiveReel(v.item.id);
      }
      if (prevId && prevId !== v.item.id) {
        releasePinRef.current(prevId);
      }

      const reel = v.item;
      if (reel && !viewedReelIds.current.has(reel.id)) {
        viewedReelIds.current.add(reel.id);
        api.reels.view(reel.id).catch(() => undefined);
      }
      void prefetchAroundRef.current(reelsRef.current, v.index);
    }
  ).current;

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 51, minimumViewTime: 80 }),
    []
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<ReelDTO> | null | undefined, index: number) => ({
      length: reelHeight,
      offset: reelHeight * index,
      index,
    }),
    [reelHeight]
  );

  const seekToProgress = useCallback((ratio: number) => {
    const player = getActivePlayer(activeReelIdRef.current);
    if (!player) return;
    const duration = durationMillisRef.current || 1;
    const clamped = Math.max(0, Math.min(1, ratio));
    void player.setPositionAsync(clamped * duration);
    setProgress(clamped);
  }, [getActivePlayer]);

  const progressPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_, gesture) => {
          isScrubbingRef.current = true;
          setIsScrubbing(true);
          const v = getActivePlayer(activeReelIdRef.current);
          void v?.pauseAsync();
          setIsPlaying(false);
          seekToProgress(gesture.x0 / reelWidth);
        },
        onPanResponderMove: (_, gesture) => {
          seekToProgress(gesture.moveX / reelWidth);
        },
        onPanResponderRelease: () => {
          isScrubbingRef.current = false;
          setIsScrubbing(false);
          const v = getActivePlayer(activeReelIdRef.current);
          void v?.playAsync();
          setIsPlaying(true);
        },
        onPanResponderTerminate: () => {
          isScrubbingRef.current = false;
          setIsScrubbing(false);
        },
      }),
    [reelWidth, seekToProgress, getActivePlayer]
  );

  const handleDelete = useCallback(
    (reel: ReelDTO) => {
      Alert.alert('Delete reel?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            removeReelLocally(reel.id);
            try {
              await api.reels.delete(reel.id);
            } catch (e) {
              const message = e instanceof ApiError ? e.message : 'Delete failed';
              Alert.alert('Reels', message);
              reload();
            }
          },
        },
      ]);
    },
    [removeReelLocally, reload]
  );

  const quickFollow = useCallback(
    async (reel: ReelDTO) => {
      const authorId = reel.author_id;
      if (!authorId) return;
      if (followedAuthorIds.has(authorId) || followBusyAuthorIds.has(authorId)) return;
      setFollowBusyAuthorIds((prev) => new Set(prev).add(authorId));
      setFollowedAuthorIds((prev) => new Set(prev).add(authorId));
      try {
        await api.friendships.request(authorId);
      } catch {
        // rollback optimistic check on failure
        setFollowedAuthorIds((prev) => {
          const next = new Set(prev);
          next.delete(authorId);
          return next;
        });
      } finally {
        setFollowBusyAuthorIds((prev) => {
          const next = new Set(prev);
          next.delete(authorId);
          return next;
        });
      }
    },
    [followBusyAuthorIds, followedAuthorIds]
  );

  const renderReel = useCallback(
    ({ item, index }: { item: ReelDTO; index: number }) => (
      <ReelFeedRow
        item={item}
        index={index}
        currentIndex={currentIndex}
        reelWidth={reelWidth}
        reelHeight={reelHeight}
        desktopActionOffset={desktopActionOffset}
        usePhoneFrame={usePhoneFrame}
        isFocused={isFocused}
        mediaShouldPlay={mediaShouldPlay}
        isMuted={isMuted}
        volume={volume}
        isReady={readyReelIds.has(item.id)}
        isFollowing={followedAuthorIds.has(item.author_id)}
        metaBottom={metaBottom}
        videoUri={resolveUri(item)}
        onVideoPress={handleVideoPress}
        onDelete={handleDelete}
        onToggleLike={toggleLike}
        onQuickFollow={quickFollow}
        onOpenComments={onOpenComments}
        onOpenShare={onOpenShare}
        onOpenProfile={onOpenProfile}
        onNavigateSound={onNavigateSound}
        onReady={handleVideoReady}
        onPlaybackStatus={handlePlaybackStatus}
        onRef={registerVideoRef}
        onMediaIndexChange={handleMediaIndexChange}
      />
    ),
    [
      currentIndex,
      reelHeight,
      reelWidth,
      desktopActionOffset,
      usePhoneFrame,
      isFocused,
      mediaShouldPlay,
      isMuted,
      volume,
      readyReelIds,
      followedAuthorIds,
      metaBottom,
      resolveUri,
      handleVideoPress,
      handleDelete,
      toggleLike,
      quickFollow,
      onOpenComments,
      onOpenShare,
      onOpenProfile,
      onNavigateSound,
      handleVideoReady,
      handlePlaybackStatus,
      registerVideoRef,
      handleMediaIndexChange,
    ]
  );

  const currentReel = reels[currentIndex] ?? null;

  if (loading && reels.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.emptyText}>Loading reels…</Text>
      </View>
    );
  }

  if (error && reels.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Ionicons name="cloud-offline-outline" size={48} color="#fff" />
        <Text style={styles.emptyText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={reload}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, usePhoneFrame && styles.containerPhoneFrame]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <View style={[styles.feedColumn, { width: reelWidth }]}>

      <View
        style={[
          styles.topBarWrap,
          { paddingTop: usePhoneFrame ? 16 : insets.top + 8 },
          usePhoneFrame && styles.topBarWrapDesktop,
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={goToChats}
            accessibilityLabel="Back to chats"
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>

          {!usePhoneFrame && (
            <View style={styles.feedPills}>
              <TouchableOpacity
                style={feedMode === 'forYou' ? styles.feedPillActive : styles.feedPill}
                onPress={() => switchFeedMode('forYou')}
              >
                <Text style={feedMode === 'forYou' ? styles.feedPillActiveText : styles.feedPillText}>
                  For You
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={feedMode === 'following' ? styles.feedPillActive : styles.feedPill}
                onPress={() => switchFeedMode('following')}
              >
                <Text style={feedMode === 'following' ? styles.feedPillActiveText : styles.feedPillText}>
                  Following
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.topIconBtnSpacer} />
        </View>
      </View>

      {(activeCount > 0 || summary.error > 0) && (
        <TouchableOpacity
          onPress={() => setShowUploadPanel(true)}
          style={[styles.uploadStatusChip, { top: insets.top + 56 }]}
          activeOpacity={0.85}
        >
          <Ionicons
            name={summary.error > 0 ? 'alert-circle' : 'cloud-upload-outline'}
            size={14}
            color="#fff"
          />
          <Text style={styles.uploadStatusText}>
            {summary.error > 0
              ? `${summary.error} upload failed`
              : `Uploading ${activeProgress}%`}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#fff" />
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={reels}
        style={{ height: reelHeight }}
        contentContainerStyle={reels.length === 0 ? undefined : { flexGrow: 0 }}
        extraData={currentIndex}
        renderItem={renderReel}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
        pagingEnabled
        snapToInterval={reelHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        removeClippedSubviews={Platform.OS === 'android' ? false : undefined}
        windowSize={5}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        onEndReached={() => {
          if (hasMore && !loadingMore) loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handlePullRefresh()}
            tintColor="#fff"
            colors={['#fff', '#1e90ff']}
            progressViewOffset={insets.top + 48}
            title={Platform.OS === 'ios' ? 'Pull to refresh' : undefined}
            titleColor="rgba(255,255,255,0.7)"
          />
        }
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { height: reelHeight, width: reelWidth }]}>
            <Ionicons
              name={feedMode === 'following' ? 'people-outline' : 'film-outline'}
              size={56}
              color="#666"
            />
            <Text style={styles.emptyText}>
              {feedMode === 'following'
                ? 'No reels from people you follow'
                : 'No reels yet'}
            </Text>
            {feedMode === 'following' ? (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => navigation.navigate('ReelSearch')}
              >
                <Text style={styles.retryButtonText}>Find friends to follow</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  openPostReelCompose();
                  navigation.navigate('PostReel' as never);
                }}
              >
                <Text style={styles.retryButtonText}>Post the first reel</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null
        }
      />
      {reels.length > 0 && (
        <ReelFeedOverlays
          reel={currentReel}
          reelWidth={reelWidth}
          reelHeight={reelHeight}
          usePhoneFrame={usePhoneFrame}
          progress={progress}
          bufferedProgress={bufferedProgress}
          progressBottom={progressBottom}
          isScrubbing={isScrubbing}
          playbackIcon={playbackIcon}
          endScreenReelId={endScreenReelId}
          badgePlayCycle={badgePlayCycle}
          heartScale={heartScale}
          heartOpacity={heartOpacity}
          progressPanHandlers={progressPan.panHandlers}
        />
      )}
      </View>

      {Platform.OS === 'web' && isFocused && (
        <View
          style={[
            styles.volumeOverlay,
            { height: reelHeight },
            usePhoneFrame && { width: reelWidth, alignSelf: 'center' },
          ]}
          pointerEvents="box-none"
        >
          <VolumeControl
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={(v) => {
              setVolume(v);
              setIsMuted(v === 0);
            }}
            onMuteToggle={() => {
              if (isMuted) {
                setIsMuted(false);
                if (volume === 0) setVolume(1);
              } else {
                setIsMuted(true);
              }
            }}
          />
        </View>
      )}

      {usePhoneFrame && reels.length > 0 && (
        <View style={navArrowStyles.container}>
          <TouchableOpacity
            style={[navArrowStyles.btn, currentIndex === 0 && navArrowStyles.btnDisabled]}
            onPress={() => {
              if (currentIndex > 0) {
                flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true });
              }
            }}
            disabled={currentIndex === 0}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-up" size={28} color={currentIndex === 0 ? 'rgba(255,255,255,0.2)' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[navArrowStyles.btn, currentIndex >= reels.length - 1 && navArrowStyles.btnDisabled]}
            onPress={() => {
              if (currentIndex < reels.length - 1) {
                flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
              }
            }}
            disabled={currentIndex >= reels.length - 1}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={28} color={currentIndex >= reels.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff'} />
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={!!openComments}
        animationType="slide"
        transparent
        onRequestClose={closeSheets}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSheets}
          />
          <View style={[styles.sheetWrapper, { paddingBottom: insets.bottom }]}>
            {openComments && (
              <ReelCommentSheet
                reelId={openComments.id}
                onClose={closeSheets}
                onCommentAdded={() => applyLocalCommentChange(openComments.id, 1)}
                onCommentRemoved={() => applyLocalCommentChange(openComments.id, -1)}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!openShare}
        animationType="slide"
        transparent
        onRequestClose={closeSheets}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSheets}
          />
          <View style={[styles.sheetWrapper, { paddingBottom: insets.bottom }]}>
            {openShare && (
              <ReelShareSheet reel={openShare} onClose={closeSheets} />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!openProfile}
        animationType="slide"
        transparent
        onRequestClose={closeSheets}
      >
        <View style={[styles.modalBackdrop, usePhoneFrame && styles.modalBackdropCentered]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSheets}
          />
          <View
            style={[
              styles.profileSheetWrapper,
              usePhoneFrame && styles.profileSheetPhone,
              { paddingBottom: usePhoneFrame ? 0 : insets.bottom },
            ]}
          >
            {openProfile && (
              <ReelProfileSheet
                reel={openProfile}
                onClose={closeSheets}
                onFollowStateChange={(authorId, state) => {
                  setFollowedAuthorIds((prev) => {
                    const next = new Set(prev);
                    if (state === 'following' || state === 'pending') next.add(authorId);
                    else next.delete(authorId);
                    return next;
                  });
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showUploadPanel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUploadPanel(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowUploadPanel(false)}
          />
          <View style={[styles.sheetWrapper, styles.uploadPanelWrapper, { paddingBottom: insets.bottom }]}>
            <View style={styles.uploadPanelHeader}>
              <Text style={styles.uploadPanelTitle}>Background uploads</Text>
              <TouchableOpacity onPress={() => setShowUploadPanel(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.uploadPanelList}>
              {uploadTasks.length === 0 ? (
                <Text style={styles.uploadPanelEmpty}>No uploads yet.</Text>
              ) : (
                uploadTasks.map((task) => (
                  <View key={task.id} style={styles.uploadItem}>
                    <View style={styles.uploadItemLeft}>
                      <Text style={styles.uploadItemTitle}>Reel upload</Text>
                      <Text style={styles.uploadItemStage}>{task.stage}</Text>
                      {(task.status === 'uploading' ||
                        task.status === 'publishing' ||
                        task.status === 'queued') && (
                        <ProgressBar
                          progress={(task.progress ?? 0) / 100}
                          color="#1e90ff"
                          style={styles.uploadItemProgress}
                        />
                      )}
                      {task.error ? <Text style={styles.uploadItemError}>{task.error}</Text> : null}
                    </View>
                    {task.status === 'error' ? (
                      <TouchableOpacity
                        style={styles.uploadRetryBtn}
                        onPress={() => {
                          const ok = retryReelUploadTask(task.id);
                          if (!ok) Alert.alert('Uploads', 'Unable to retry this upload.');
                        }}
                      >
                        <Ionicons name="refresh" size={14} color="#fff" />
                        <Text style={styles.uploadRetryText}>Retry</Text>
                      </TouchableOpacity>
                    ) : task.status === 'done' ? (
                      <Text style={styles.uploadItemDone}>Done</Text>
                    ) : (
                      <Text style={styles.uploadItemStatus}>{task.progress ?? 0}%</Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
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
    overflow: 'visible',
    marginVertical: 8,
    flex: undefined,
  },
  center: { justifyContent: 'center', alignItems: 'center' },
  reelContainer: { position: 'relative', backgroundColor: '#000', overflow: 'hidden' },
  reelContainerDesktop: { borderRadius: 16, overflow: 'hidden' },
  videoTouchLayer: { ...StyleSheet.absoluteFill, zIndex: 1 },
  videoTouchLayerDesktop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  topBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  topBarWrapDesktop: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topIconBtnSpacer: {
    width: 40,
    height: 40,
  },
  refreshBanner: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  refreshBannerText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  feedPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  feedPillActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#fff',
    paddingBottom: 4,
  },
  feedPillActiveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  feedPill: { paddingBottom: 4 },
  feedPillText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadStatusChip: {
    position: 'absolute',
    left: 64,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '60%',
  },
  uploadStatusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  uploadPanelWrapper: { height: '62%' },
  uploadPanelHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadPanelTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  uploadPanelList: { padding: 12, gap: 10 },
  uploadPanelEmpty: { color: '#9ca3af', textAlign: 'center', marginTop: 16 },
  uploadItem: {
    backgroundColor: '#1b1b1b',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  uploadItemLeft: { flex: 1 },
  uploadItemTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  uploadItemStage: { color: '#cbd5e1', fontSize: 12, marginTop: 4 },
  uploadItemProgress: { marginTop: 8, height: 4, borderRadius: 2, backgroundColor: '#333' },
  uploadItemError: { color: '#f87171', fontSize: 11, marginTop: 4 },
  uploadItemDone: { color: '#4ade80', fontSize: 12, fontWeight: '700' },
  uploadItemStatus: { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
  uploadRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  uploadRetryText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  muteButton: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 8,
    zIndex: 18,
    elevation: 18,
  },
  muteButtonMobile: {
    position: 'absolute',
    left: 14,
  },
  progressContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 28,
    zIndex: 17,
    elevation: 17,
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  progressGrab: {
    cursor: 'grab',
  } as object,
  progressScrubbing: {
    cursor: 'grabbing',
  } as object,
  volumeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    zIndex: 200,
    elevation: 200,
    pointerEvents: 'box-none',
  },
  scrubArea: {
    position: 'absolute',
    left: 0,
    right: REEL_ACTION_RAIL_WIDTH,
    zIndex: 17,
    elevation: 17,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  compactUser: { flexShrink: 1, maxWidth: '42%' },
  compactUsername: { color: '#fff', fontSize: 12, fontWeight: '800' },
  compactStats: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  compactStat: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700' },
  captionStrip: {
    position: 'absolute',
    left: 12,
    right: REEL_ACTION_RAIL_WIDTH + 8,
    zIndex: 16,
  },
  captionSmall: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' },
  progressBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBuffered: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 2,
  },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
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
  bottomMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 15,
    elevation: 15,
    paddingHorizontal: 14,
  },
  bottomMetaDesktop: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  captionContainer: { marginBottom: 0 },
  userInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#fff' },
  avatarFallback: {
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  username: { color: '#fff', fontWeight: '700', fontSize: 15 },
  visibilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
  },
  caption: { color: '#fff', fontSize: 14, marginBottom: 8, lineHeight: 19, fontWeight: '500' },
  musicContainer: { flexDirection: 'row', alignItems: 'center', maxWidth: '92%' },
  music: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginLeft: 6, flex: 1 },
  actionButtons: {
    position: 'absolute',
    right: 6,
    width: REEL_ACTION_RAIL_WIDTH - 8,
    alignItems: 'center',
    zIndex: 25,
    elevation: 25,
  },
  actionButtonsDesktop: {
    right: 0,
    width: REEL_ACTION_RAIL_WIDTH,
  },
  actionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapActive: {
    backgroundColor: 'rgba(0,122,255,0.25)',
    borderColor: 'rgba(0,122,255,0.45)',
  },
  profileActionWrap: { marginBottom: 14, alignItems: 'center', position: 'relative' },
  profileButton: { alignItems: 'center' },
  profileAvatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#fff' },
  profileFollowPlus: {
    position: 'absolute',
    bottom: -5,
    backgroundColor: REEL_ACCENT,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  actionButton: { alignItems: 'center', marginBottom: 12 },
  actionText: { color: '#fff', fontSize: 11, marginTop: 4, fontWeight: '700' },
  actionTextDesktop: { fontSize: 12 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: SCREEN_WIDTH,
  },
  emptyText: { color: '#fff', marginTop: 16, fontSize: 16 },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1976d2',
    borderRadius: 22,
  },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  footerLoader: { paddingVertical: 32, alignItems: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: {
    height: '78%',
    backgroundColor: '#111',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  profileSheetWrapper: {
    height: '100%',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  modalBackdropCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
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
