import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  PanResponder,
  Platform,
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
import { showAppToast } from '../../lib/appToast';
import { scheduleGiftCatalogPrefetch } from '../../lib/giftCatalogPrefetch';
import { scheduleReelInboxPrefetch } from '../../lib/reelInboxPrefetch';
import { useReelsFeed } from '../../hooks/useReelsFeed';
import { useReelUploadQueue } from '../../hooks/useReelUploadQueue';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { retryReelUploadTask, MAX_UPLOAD_RETRIES } from '../../lib/reelUploadQueue';
import {
  registerBeforeChatNavigate,
  unregisterBeforeChatNavigate,
} from '../../navigation/chatNavigationBridge';
import { navigateMainTab, navigateToPostReel } from '../../navigation/rootNavigation';
import { openPostReelCompose, openPostReelWithSound, registerReelFeedPauseHandler, useReelPlaybackGateActive } from '../../lib/reelPlaybackBridge';
import { stopAllReelOverlaySounds } from '../../hooks/useReelSoundPlayback';
import ReelCommentSheet from './ReelCommentSheet';
import ReelShareSheet from './ReelShareSheet';
import ReelProfileSheet from './ReelProfileSheet';
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  REEL_ACTION_RAIL_RIGHT,
  REEL_ACTION_RAIL_WIDTH,
  REEL_BOTTOM_INSET,
  REEL_DESKTOP_VERTICAL_INSET,
  REEL_PHONE_MAX_WIDTH,
  getReelFrameDimensions,
} from './reelVideoLayout';
import { useReelVideoPrefetch } from './useReelVideoPrefetch';
import { markReelWatched } from './reelVideoCache';
import { reelTabBarOffset } from './ReelsTabBar';
import { useReelsMainTabFocused } from '../../context/ReelsMainTabFocusContext';
import { useReelFeedMode } from './ReelFeedModeContext';
import { REEL_ACCENT, REEL_END_SCREEN_MS, reelBottomLayout } from './reelTheme';
import { VolumeControl } from './VolumeControl';
import { ReelFeedRow } from './ReelFeedRow';
import { ReelFeedOverlays } from './ReelFeedOverlays';
import { ReelGiftSheet } from './ReelGiftSheet';
import { ReelBuyCoinsSheet } from './ReelBuyCoinsSheet';
import { ReelGiftBurst, type GiftBurstPayload } from './ReelGiftBurst';
import { useWallet } from '../../hooks/useWallet';
import { useReelProfileStore } from '../../stores/reelProfileStore';
import { ReelWebFeed, type ReelWebFeedHandle } from './ReelWebFeed';
import { ReelNativeFeed, type ReelNativeFeedHandle } from './ReelNativeFeed';
import { ReelFloatingChrome } from './ReelFloatingChrome';
import { useAuth } from '../../hooks/useAuth';
import { promptSignIn } from '../../lib/requireSignedIn';

const WINDOW_HEIGHT = SCREEN_HEIGHT;
const PROGRESS_UI_MS = 280;

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
  const { feedMode, setFeedMode } = useReelFeedMode();
  const { isGuest, isAuthenticated, exitGuest } = useAuth();
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;
  const [viewportHeight, setViewportHeight] = useState(0);
  const bottomNavOffset = reelTabBarOffset(insets.bottom, usePhoneFrame);
  // Tab bar is position:absolute, so onLayout is full screen — subtract bar
  // so each page matches the visible area above the nav.
  // Wait for onLayout before using a height so the feed doesn't mount at
  // windowHeight then shrink (that mis-snaps past reel 0 on first visit).
  const layoutReady = viewportHeight > 0;
  const reelHeight = layoutReady
    ? Math.max(
        320,
        usePhoneFrame
          ? Math.max(0, viewportHeight - REEL_DESKTOP_VERTICAL_INSET * 2)
          : viewportHeight - bottomNavOffset
      )
    : 0;

  const feedSource = isGuest ? 'public' : feedMode === 'forYou' ? 'feed' : 'following';
  const feedInsertAfterRef = useRef(0);

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
    softInjectNewReels,
    applyLocalLikeChange,
    applyLocalCommentChange,
    removeReelLocally,
  } = useReelsFeed(feedSource, {
    active: isFocused,
    insertAfterIndexRef: feedInsertAfterRef,
  });
  const { tasks: uploadTasks, activeCount, activeProgress, summary } = useReelUploadQueue();
  const myProfileId = useCurrentProfileId();
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const seenDoneUploadsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let injected = false;
    for (const task of uploadTasks) {
      if (task.status !== 'done' || seenDoneUploadsRef.current.has(task.id)) continue;
      seenDoneUploadsRef.current.add(task.id);
      injected = true;
    }
    if (injected && isFocused) {
      void softInjectNewReels();
    }
  }, [uploadTasks, isFocused, softInjectNewReels]);

  const webFeedRef = useRef<ReelWebFeedHandle>(null);
  const nativeFeedRef = useRef<ReelNativeFeedHandle>(null);
  const feedClipRef = useRef<View>(null);
  const wheelLockRef = useRef(false);
  /** Blocks accidental index advances while the first reel settles on first visit. */
  const feedBootUntilRef = useRef(0);
  /** Desktop wheel paging only after the user has pointed at the feed. */
  const wheelArmedRef = useRef(false);
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
  const currentIndexRef = useRef(0);
  const scrollAnchorIndexRef = useRef(0);
  const isSnappingRef = useRef(false);
  const reelHeightRef = useRef(reelHeight);
  reelHeightRef.current = reelHeight;
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [bufferedProgress, setBufferedProgress] = useState(0);
  const [playbackIcon, setPlaybackIcon] = useState<'play' | 'pause' | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Keep a ref in sync for viewability callbacks so we can clamp/choose the next index.
  useEffect(() => {
    currentIndexRef.current = currentIndex;
    feedInsertAfterRef.current = currentIndex;
  }, [currentIndex]);

  const [openComments, setOpenComments] = useState<ReelDTO | null>(null);
  const [openShare, setOpenShare] = useState<ReelDTO | null>(null);
  const [openProfile, setOpenProfile] = useState<ReelDTO | null>(null);
  const [giftReel, setGiftReel] = useState<ReelDTO | null>(null);
  const [giftBurst, setGiftBurst] = useState<GiftBurstPayload | null>(null);
  const [buyCoinsOpen, setBuyCoinsOpen] = useState(false);

  const { wallet, setBalanceCoins } = useWallet(isFocused && isAuthenticated);

  const gateActive = useReelPlaybackGateActive();
  const sheetOpen = Boolean(openComments || openShare || openProfile || giftReel || buyCoinsOpen);
  const mediaShouldPlay = isPlaying && isFocused && !sheetOpen && !gateActive;
  const mediaShouldPlayRef = useRef(mediaShouldPlay);
  mediaShouldPlayRef.current = mediaShouldPlay;
  const canAutoplayRef = useRef(false);
  canAutoplayRef.current = isFocused && !sheetOpen && !gateActive;

  const [followedAuthorIds, setFollowedAuthorIds] = useState<Set<string>>(new Set());
  const [followBusyAuthorIds, setFollowBusyAuthorIds] = useState<Set<string>>(new Set());
  const [endScreenReelId, setEndScreenReelId] = useState<string | null>(null);
  const [badgePlayCycle, setBadgePlayCycle] = useState(0);
  const endScreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feed height already excludes the tab bar (which includes safe-area).
  // Do not pass insets.bottom again or progress/rail float above the nav.
  const { progressBottom, metaBottom } = reelBottomLayout(usePhoneFrame ? 0 : 4);

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
    stopAllReelOverlaySounds();
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

      const reel = reelsRef.current.find((r) => r.id === reelId);
      const tStatus = reel?.transcode_status;
      const softTrim =
        reel &&
        (tStatus === 'pending' || tStatus === 'processing' || tStatus === 'failed') &&
        reel.trim_end_sec != null &&
        Number.isFinite(reel.trim_end_sec);
      const trimStartMs = Math.max(0, Math.round((reel?.trim_start_sec ?? 0) * 1000));
      const trimEndMs =
        softTrim && reel?.trim_end_sec != null
          ? Math.round(reel.trim_end_sec * 1000)
          : null;

      // Loop inside the author trim window until the server replaces the file.
      if (
        softTrim &&
        trimEndMs != null &&
        status.positionMillis != null &&
        status.positionMillis >= trimEndMs - 80
      ) {
        const key = activePlayerKey(reelId);
        const player = key ? videos.current[key] : null;
        if (player && mediaShouldPlayRef.current) {
          void player.setPositionAsync(trimStartMs).then(() => player.playAsync());
        }
        const clipLen = Math.max(1, trimEndMs - trimStartMs);
        scheduleProgressUi(1, 1);
        durationMillisRef.current = clipLen;
        return;
      }

      if (status.didJustFinish) {
        const key = activePlayerKey(reelId);
        void (key ? videos.current[key] : null)?.pauseAsync();

        // Group reels: jump to the next reel posted to the same group.
        const list = reelsRef.current;
        const idx = list.findIndex((r) => r.id === reelId);
        const finished = idx >= 0 ? list[idx] : null;
        if (finished?.visibility === 'group' && finished.group_id) {
          const nextGroupIdx = list.findIndex(
            (r, i) =>
              i > idx && r.visibility === 'group' && r.group_id === finished.group_id
          );
          if (nextGroupIdx >= 0 && mediaShouldPlayRef.current) {
            setEndScreenReelId(null);
            setProgress(0);
            goToReelIndexRef.current(nextGroupIdx, true);
            return;
          }
        }

        setEndScreenReelId(reelId);
        if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
        endScreenTimerRef.current = setTimeout(() => {
          setEndScreenReelId((cur) => (cur === reelId ? null : cur));
          setBadgePlayCycle((c) => c + 1);
          const replayKey = activePlayerKey(reelId);
          // Respect the current play/pause state: if the user paused, don't
          // automatically resume just because the reel ended.
          if (mediaShouldPlayRef.current) {
            const p = replayKey ? videos.current[replayKey] : null;
            if (softTrim && p) {
              void p.setPositionAsync(trimStartMs).then(() => p.playAsync());
            } else {
              void p?.replayAsync();
            }
          }
        }, REEL_END_SCREEN_MS);
        return;
      }
      if (status.durationMillis != null && status.durationMillis > 0) {
        const clipLen =
          softTrim && trimEndMs != null
            ? Math.max(1, trimEndMs - trimStartMs)
            : status.durationMillis;
        durationMillisRef.current = clipLen;
        if (isScrubbingRef.current) return;
        const buffered =
          status.bufferedMillis != null
            ? Math.min(1, Math.max(0, status.bufferedMillis / status.durationMillis))
            : progressUiRef.current.buffered;
        const nextProgress =
          status.positionMillis != null
            ? softTrim && trimEndMs != null
              ? Math.min(
                  1,
                  Math.max(0, (status.positionMillis - trimStartMs) / clipLen)
                )
              : status.positionMillis / status.durationMillis
            : progressUiRef.current.progress;
        scheduleProgressUi(nextProgress, buffered);
      }
    },
    [scheduleProgressUi]
  );

  const refreshFollowedAuthors = useCallback(async () => {
    if (isGuest || !myProfileId) return;
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
  }, [isGuest, myProfileId]);

  const requireAuth = useCallback(
    (message?: string) => {
      if (isAuthenticated) return true;
      promptSignIn({
        message: message ?? 'Sign in to interact with reels.',
        onLogin: () => exitGuest(),
      });
      return false;
    },
    [isAuthenticated, exitGuest]
  );

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
    goToReelIndexRef.current(0, false);
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
      if (isGuest && mode === 'following') {
        requireAuth('Sign in to see reels from people you follow.');
        return;
      }
      if (mode === feedMode) return;
      setFeedMode(mode);
    },
    [feedMode, setFeedMode, isGuest, requireAuth]
  );

  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const tapCount = useRef(0);
  const lastTap = useRef(0);
  const likeInFlightRef = useRef<Set<string>>(new Set());

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

  const openSponsoredCta = useCallback(async (reel: ReelDTO) => {
    if (!reel.is_sponsored) return;
    const url = reel.cta_url?.trim();
    const campaignId = reel.ad_campaign_id || reel.id;
    if (!isGuestRef.current && campaignId) {
      api.ads
        .track({ campaign_id: campaignId, event_type: 'cta', placement: 'reels_feed' })
        .catch(() => undefined);
    }
    if (!url) return;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else showAppToast('Could not open link', { isError: true });
    } catch {
      showAppToast('Could not open link', { isError: true });
    }
  }, []);

  const toggleLike = useCallback(
    async (reel: ReelDTO, viaDoubleTap = false) => {
      if (!reel?.id || reel.is_sponsored) return;
      if (!requireAuth('Sign in to like this reel.')) return;
      // Rapid taps would otherwise fire overlapping like/unlike calls and the
      // loser of the race rolls the heart back.
      if (likeInFlightRef.current.has(reel.id)) {
        if (viaDoubleTap) animateHeart();
        return;
      }
      likeInFlightRef.current.add(reel.id);
      const next = !reel.liked_by_me;
      applyLocalLikeChange(reel.id, next);
      if (next || viaDoubleTap) animateHeart();
      try {
        if (next) await api.reels.like(reel.id);
        else await api.reels.unlike(reel.id);
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        // 409/422 means the server already agrees with the optimistic state.
        if (status === 409 || status === 422) return;
        applyLocalLikeChange(reel.id, !next);
        showAppToast(e instanceof ApiError ? e.message : 'Could not update like', {
          isError: true,
        });
      } finally {
        likeInFlightRef.current.delete(reel.id);
      }
    },
    [applyLocalLikeChange, animateHeart, requireAuth]
  );

  const playActiveReel = useCallback(
    async (reelId: string | null, shouldPlay?: boolean) => {
      const wantPlay = shouldPlay ?? mediaShouldPlayRef.current;
      activeReelIdRef.current = reelId;
      const slideIndex = reelId ? (activeMediaIndexRef.current[reelId] ?? 0) : 0;
      const activeSlideKey = reelId ? `${reelId}:${slideIndex}` : null;

      // Pause everyone first so adjacent prefetched players never overlap audio/video.
      const entries = Object.entries(videos.current);
      await Promise.all(
        entries.map(async ([, player]) => {
          if (!player) return;
          try {
            await player.pauseAsync();
          } catch {
            /* ignore */
          }
        })
      );

      if (!reelId || !wantPlay) return;
      const active =
        (activeSlideKey ? videos.current[activeSlideKey] : null) ??
        videos.current[reelId] ??
        null;
      if (!active) return;
      try {
        // While the server still has the full original file, clamp playback to the
        // preview trim window so the posted reel matches what the author cut.
        const reel = reelsRef.current.find((r) => r.id === reelId);
        const status = reel?.transcode_status;
        const softTrim =
          reel &&
          (status === 'pending' || status === 'processing' || status === 'failed') &&
          ((reel.trim_start_sec != null && reel.trim_start_sec > 0.05) ||
            (reel.trim_end_sec != null &&
              reel.trim_start_sec != null &&
              reel.trim_end_sec > reel.trim_start_sec + 0.05));
        if (softTrim) {
          const startMs = Math.max(0, Math.round((reel.trim_start_sec ?? 0) * 1000));
          await active.setPositionAsync(startMs);
        }
        await active.playAsync();
      } catch {
        /* ignore transient av errors */
      }
    },
    []
  );

  const playActiveReelRef = useRef(playActiveReel);
  playActiveReelRef.current = playActiveReel;

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
    (reel: ReelDTO) => {
      if (reel.is_sponsored) return;
      if (!requireAuth('Sign in to comment on reels.')) return;
      openSheet(setOpenComments, reel);
    },
    [openSheet, requireAuth]
  );
  const onOpenShare = useCallback(
    (reel: ReelDTO) => {
      if (reel.is_sponsored) return;
      if (!requireAuth('Sign in to share reels with friends.')) return;
      openSheet(setOpenShare, reel);
    },
    [openSheet, requireAuth]
  );
  const onOpenGift = useCallback(
    (reel: ReelDTO) => {
      if (reel.is_sponsored) return;
      if (!requireAuth('Sign in to send gifts.')) return;
      void pausePlayers();
      setGiftReel(reel);
    },
    [pausePlayers, requireAuth]
  );
  const handleGiftSent = useCallback(
    (payload: { gift: { emoji: string; name: string }; balanceCoins: number }) => {
      setBalanceCoins(payload.balanceCoins);
      setGiftBurst({
        emoji: payload.gift.emoji,
        name: payload.gift.name,
        key: `${Date.now()}`,
      });
    },
    [setBalanceCoins]
  );
  const onOpenProfile = useCallback(
    (reel: ReelDTO) => {
      if (reel.is_sponsored) {
        void openSponsoredCta(reel);
        return;
      }
      if (!requireAuth('Sign in to view creator profiles.')) return;
      openSheet(setOpenProfile, reel);
    },
    [openSheet, openSponsoredCta, requireAuth]
  );
  const onNavigateSound = useCallback(
    (soundId: string) => {
      if (!requireAuth('Sign in to browse sounds.')) return;
      navigation.navigate('ReelSound', { soundId });
    },
    [navigation, requireAuth]
  );

  const onUseReelAudio = useCallback(
    (reel: ReelDTO) => {
      if (!requireAuth('Sign in to use this sound.')) return;
      if (reel.sound?.id) {
        navigation.navigate('ReelSound', { soundId: reel.sound.id });
        return;
      }
      navigation.navigate('ReelSound', { fromReelId: reel.id });
    },
    [navigation, requireAuth]
  );

  const onUseThisSound = useCallback(
    (reel: ReelDTO) => {
      if (!requireAuth('Sign in to use this sound.')) return;
      if (!reel.sound) {
        onUseReelAudio(reel);
        return;
      }
      openPostReelWithSound(reel.sound);
      navigateToPostReel();
    },
    [requireAuth, onUseReelAudio]
  );

  const goToChats = useCallback(() => {
    if (isGuest) {
      const guestMainTabs = navigation.getParent?.()?.getParent?.();
      if (guestMainTabs?.navigate) {
        guestMainTabs.navigate('Chats');
      } else {
        requireAuth('Sign in to open your chats.');
      }
      return;
    }
    void pauseAllVideos();
    navigateMainTab('Chats');
  }, [isGuest, navigation, requireAuth, pauseAllVideos]);

  const handlePullRefresh = useCallback(async () => {
    if (currentIndex !== 0) {
      goToReelIndexRef.current(0, false);
    }
    // Feed refresh clears the spinner; follow-authors runs in parallel (non-blocking).
    const feedPromise = refresh();
    if (feedMode === 'following') {
      void refreshFollowedAuthors();
    }
    await feedPromise;
    goToReelIndexRef.current(0, false);
    const first = reelsRef.current[0];
    if (first) {
      activeReelIdRef.current = first.id;
      void playActiveReel(first.id);
      setIsPlaying(true);
    }
  }, [currentIndex, feedMode, refresh, refreshFollowedAuthors, playActiveReel]);

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

  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVideoPress = useCallback(
    (reel: ReelDTO) => {
      const now = Date.now();
      if (now - lastTap.current < 350) {
        tapCount.current += 1;
      } else {
        tapCount.current = 1;
      }
      lastTap.current = now;

      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        const count = tapCount.current;
        tapCount.current = 0;
        tapTimerRef.current = null;
        // Single tap → pause/play. Double / triple / more → like.
        if (count >= 2) {
          if (!reel.liked_by_me) void toggleLike(reel, true);
          else animateHeart();
        } else if (count === 1) {
          void togglePlayPause();
        }
      }, 320);
    },
    [animateHeart, toggleLike, togglePlayPause]
  );

  // Pause when screen blurs, a sheet opens, or a global gate is active.
  useEffect(() => {
    if (!isFocused || sheetOpen || gateActive) {
      void pauseAllVideos();
      return;
    }
    setIsPlaying(true);
    if (activeReelIdRef.current) {
      void playActiveReel(activeReelIdRef.current);
    }
  }, [isFocused, sheetOpen, gateActive, pauseAllVideos, playActiveReel]);

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

  // Prefetch gift catalog + inbox while watching reels — never blocks first paint.
  useEffect(() => {
    if (!isFocused || isGuest) return;
    void scheduleGiftCatalogPrefetch(0);
    void scheduleReelInboxPrefetch(0);
  }, [isFocused, isGuest]);

  useEffect(() => {
    if (!isFocused || reels.length === 0) return;
    if (!activeReelIdRef.current) {
      const first = reels[0];
      if (!first) return;
      activeReelIdRef.current = first.id;
      setCurrentIndex(0);
      for (const reel of reels.slice(0, 3)) {
        warmReel(reel);
      }
      prefetchAround(reels, 0);
      void playActiveReel(first.id);
      return;
    }
    prefetchAround(reels, currentIndex);
  }, [isFocused, reels, currentIndex, warmReel, prefetchAround, playActiveReel]);

  // When the user is near the end of the currently loaded list, prefetch the next page
  // so we don't show a noticeable loading gap.
  useEffect(() => {
    if (!isFocused) return;
    if (!hasMore || loadingMore) return;
    if (reels.length < 10) return;
    if (currentIndex >= reels.length - 6) {
      void loadMore();
    }
  }, [isFocused, hasMore, loadingMore, reels.length, currentIndex, loadMore]);

  // Pre-warm profile content for the current/next reel author so opening the profile sheet
  // feels instant (the store will fetch only if not already cached/fresh).
  const ensureProfileLoaded = useReelProfileStore((s) => s.ensureLoaded);
  const currentAuthorId = reels[currentIndex]?.author_id;
  const nextAuthorId = reels[currentIndex + 1]?.author_id;
  useEffect(() => {
    if (!isFocused || isGuest) return;
    const ids = new Set<string>();
    if (currentAuthorId) ids.add(currentAuthorId);
    if (nextAuthorId) ids.add(nextAuthorId);
    for (const id of ids) {
      void ensureProfileLoaded(id, 24);
    }
  }, [isFocused, isGuest, currentAuthorId, nextAuthorId, ensureProfileLoaded]);

  const hasReels = reels.length > 0;
  useEffect(() => {
    if (!isFocused || !layoutReady || !hasReels) return;
    // Keep reel 0 locked until the user interacts — layout/scroll-snap must not auto-advance.
    feedBootUntilRef.current = Date.now() + 1500;
    wheelArmedRef.current = false;
  }, [isFocused, layoutReady, hasReels]);

  const handleFeedIndexChange = useCallback((index: number) => {
    if (
      Date.now() < feedBootUntilRef.current &&
      currentIndexRef.current === 0 &&
      index > 0
    ) {
      if (Platform.OS === 'web') {
        webFeedRef.current?.scrollToIndex(0, false);
      } else {
        nativeFeedRef.current?.scrollToIndex(0, false);
      }
      return;
    }
    activateReelAtIndexRef.current(index);
  }, []);

  const activateReelAtIndexRef = useRef<(index: number) => void>(() => {});
  const goToReelIndexRef = useRef<(index: number, animated?: boolean) => void>(() => {});

  const activateReelAtIndex = useCallback((nextIndex: number) => {
    const list = reelsRef.current;
    if (list.length === 0) return;
    const clamped = Math.max(0, Math.min(list.length - 1, nextIndex));
    const reel = list[clamped];
    if (!reel?.id) return;

    const prevId = activeReelIdRef.current;
    if (clamped === currentIndexRef.current && prevId === reel.id) return;

    activeReelIdRef.current = reel.id;
    currentIndexRef.current = clamped;
    setCurrentIndex(clamped);
    setProgress(0);
    setBufferedProgress(0);
    setEndScreenReelId(null);
    if (endScreenTimerRef.current) clearTimeout(endScreenTimerRef.current);
    if (prevId !== reel.id) setBadgePlayCycle((c) => c + 1);
    const shouldAutoplay = canAutoplayRef.current;
    if (shouldAutoplay) {
      setIsPlaying(true);
      setPlaybackIcon(null);
    }
    void playActiveReelRef.current(reel.id, shouldAutoplay);
    if (prevId && prevId !== reel.id) {
      releasePinRef.current(prevId);
    }

    if (!viewedReelIds.current.has(reel.id)) {
      viewedReelIds.current.add(reel.id);
      markReelWatched(reel.id);
      if (!isGuestRef.current) {
        if (reel.is_sponsored) {
          const campaignId = reel.ad_campaign_id || reel.id;
          api.ads
            .track({
              campaign_id: campaignId,
              event_type: 'impression',
              placement: 'reels_feed',
            })
            .catch(() => undefined);
        } else {
          api.reels.view(reel.id).catch(() => undefined);
        }
      }
    }
    void prefetchAroundRef.current(list, clamped);
  }, []);

  activateReelAtIndexRef.current = activateReelAtIndex;

  const goToReelIndex = useCallback((index: number, animated = true) => {
    const list = reelsRef.current;
    if (list.length === 0) return;
    const clamped = Math.max(0, Math.min(list.length - 1, index));
    if (Platform.OS === 'web') {
      webFeedRef.current?.scrollToIndex(clamped, animated);
    } else {
      nativeFeedRef.current?.scrollToIndex(clamped, animated);
    }
    activateReelAtIndexRef.current(clamped);
  }, []);

  goToReelIndexRef.current = goToReelIndex;

  // Web: desktop wheel paging. Mobile touch uses ReelWebFeed (CSS overflow + scroll-snap).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = feedClipRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const armWheel = () => {
      wheelArmedRef.current = true;
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 10) return;
      const rect = node.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      // Ignore trackpad noise until the user has clicked/touched the feed and boot ends.
      if (!wheelArmedRef.current) return;
      if (Date.now() < feedBootUntilRef.current) return;
      if (wheelLockRef.current || isSnappingRef.current) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const from = currentIndexRef.current;
      const target = Math.max(0, Math.min(reelsRef.current.length - 1, from + dir));
      if (target === from) return;
      scrollAnchorIndexRef.current = from;
      wheelLockRef.current = true;
      isSnappingRef.current = true;
      goToReelIndexRef.current(target, true);
      window.setTimeout(() => {
        isSnappingRef.current = false;
        wheelLockRef.current = false;
      }, 420);
    };

    node.addEventListener('pointerdown', armWheel, { passive: true });
    node.addEventListener('touchstart', armWheel, { passive: true });
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('pointerdown', armWheel);
      node.removeEventListener('touchstart', armWheel);
      node.removeEventListener('wheel', onWheel);
    };
  }, [reelHeight, reels.length, layoutReady]);

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
        // Don't claim the touch on start — that blocks vertical reel swipes that
        // begin near the progress bar. Only scrub on a clear horizontal drag.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
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
      if (reel.is_sponsored) return;
      if (!requireAuth('Sign in to follow creators.')) return;
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
    [followBusyAuthorIds, followedAuthorIds, requireAuth]
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
        myProfileId={myProfileId}
        videoUri={resolveUri(item)}
        onVideoPress={handleVideoPress}
        onDelete={handleDelete}
        onToggleLike={toggleLike}
        onQuickFollow={quickFollow}
        onOpenComments={onOpenComments}
        onOpenShare={onOpenShare}
        onOpenGift={onOpenGift}
        onOpenProfile={onOpenProfile}
        onNavigateSound={onNavigateSound}
        onUseReelAudio={onUseReelAudio}
        onUseThisSound={onUseThisSound}
        onSponsoredCta={openSponsoredCta}
        onReady={handleVideoReady}
        onPlaybackStatus={handlePlaybackStatus}
        onRef={registerVideoRef}
        onMediaIndexChange={handleMediaIndexChange}
        showEndScreen={endScreenReelId === item.id}
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
      myProfileId,
      resolveUri,
      handleVideoPress,
      handleDelete,
      toggleLike,
      quickFollow,
      onOpenComments,
      onOpenShare,
      onOpenGift,
      onOpenProfile,
      onNavigateSound,
      onUseReelAudio,
      onUseThisSound,
      openSponsoredCta,
      handleVideoReady,
      handlePlaybackStatus,
      registerVideoRef,
      handleMediaIndexChange,
      endScreenReelId,
    ]
  );

  const currentReel = reels[currentIndex] ?? null;

  if (loading && reels.length === 0) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          !usePhoneFrame && { marginTop: -insets.top },
        ]}
      >
        {isFocused ? <StatusBar barStyle="light-content" backgroundColor="#000" /> : null}
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.emptyText}>Loading reels…</Text>
      </View>
    );
  }

  if (error && reels.length === 0) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          !usePhoneFrame && { marginTop: -insets.top },
        ]}
      >
        {isFocused ? <StatusBar barStyle="light-content" backgroundColor="#000" /> : null}
        <Ionicons name="cloud-offline-outline" size={48} color="#fff" />
        <Text style={styles.emptyText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={reload}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        usePhoneFrame && styles.containerPhoneFrame,
        !usePhoneFrame && { marginTop: -insets.top },
      ]}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0) setViewportHeight(h);
      }}
    >
      {isFocused ? (
        <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
      ) : null}

      <View
        style={[
          styles.feedColumn,
          usePhoneFrame && styles.feedColumnPhone,
          {
            width: usePhoneFrame ? reelWidth + desktopActionOffset : reelWidth,
            ...(layoutReady
              ? { height: reelHeight }
              : { flex: 1 }),
            overflow: 'hidden',
          },
        ]}
      >

      <View
        style={[
          styles.topBarWrap,
          { paddingTop: usePhoneFrame ? 16 : Math.max(insets.top, StatusBar.currentHeight ?? 0) },
          usePhoneFrame && styles.topBarWrapDesktop,
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={goToChats}
            accessibilityLabel={isGuest ? 'Back to sign in' : 'Back to chats'}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.feedPillsCenter} pointerEvents="box-none">
            <View style={styles.feedPills}>
              <TouchableOpacity
                style={feedMode === 'forYou' || isGuest ? styles.feedPillActive : styles.feedPill}
                onPress={() => switchFeedMode('forYou')}
              >
                <Text
                  style={
                    feedMode === 'forYou' || isGuest
                      ? styles.feedPillActiveText
                      : styles.feedPillText
                  }
                >
                  For You
                </Text>
              </TouchableOpacity>
              {!isGuest ? (
                <TouchableOpacity
                  style={feedMode === 'following' ? styles.feedPillActive : styles.feedPill}
                  onPress={() => switchFeedMode('following')}
                >
                  <Text
                    style={
                      feedMode === 'following' ? styles.feedPillActiveText : styles.feedPillText
                    }
                  >
                    Following
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {Platform.OS === 'web' ? (
            <VolumeControl
              inline
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
          ) : (
            <View style={styles.topIconBtnSpacer} />
          )}
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

      <View
        ref={feedClipRef}
        style={{
          height: layoutReady ? reelHeight : '100%',
          width: '100%',
          overflow: 'hidden',
        }}
      >
      {layoutReady && reelHeight > 0 ? (
      Platform.OS === 'web' ? (
      <ReelWebFeed
        ref={webFeedRef}
        reels={reels}
        currentIndex={currentIndex}
        reelWidth={reelWidth}
        feedWidth={reelWidth + desktopActionOffset}
        reelHeight={reelHeight}
        renderItem={renderReel}
        onIndexChange={handleFeedIndexChange}
        onEndReached={() => {
          if (hasMore && !loadingMore) loadMore();
        }}
        refreshing={refreshing}
        onRefresh={handlePullRefresh}
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
                  if (!requireAuth('Sign in to post your first reel.')) return;
                  openPostReelCompose();
                  navigateToPostReel();
                }}
              >
                <Text style={styles.retryButtonText}>Post the first reel</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
      ) : (
        <ReelNativeFeed
          ref={nativeFeedRef}
          reels={reels}
          currentIndex={currentIndex}
          reelWidth={reelWidth}
          reelHeight={reelHeight}
          isFocused={isFocused}
          mediaShouldPlay={mediaShouldPlay}
          isMuted={isMuted}
          volume={volume}
          readyReelIds={readyReelIds}
          endScreenReelId={endScreenReelId}
          resolveUri={resolveUri}
          onIndexChange={handleFeedIndexChange}
          onReady={handleVideoReady}
          onPlaybackStatus={handlePlaybackStatus}
          onRef={registerVideoRef}
          onMediaIndexChange={handleMediaIndexChange}
          onVideoPress={handleVideoPress}
          onEndReached={() => {
            if (hasMore && !loadingMore) loadMore();
          }}
          refreshing={refreshing}
          onRefresh={handlePullRefresh}
          emptyComponent={
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
              <Text style={[styles.emptyText, { fontSize: 13, marginTop: 8, opacity: 0.7 }]}>
                Pull down to refresh
              </Text>
            </View>
          }
        />
      )
      ) : null}
      </View>
      {Platform.OS !== 'web' && currentReel ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { height: reelHeight },
            usePhoneFrame && { width: reelWidth + desktopActionOffset, alignSelf: 'flex-start' },
          ]}
          pointerEvents="box-none"
        >
          <ReelFloatingChrome
            reel={currentReel}
            reelWidth={reelWidth}
            reelHeight={reelHeight}
            usePhoneFrame={usePhoneFrame}
            desktopActionOffset={desktopActionOffset}
            metaBottom={metaBottom}
            myProfileId={myProfileId}
            isFollowing={followedAuthorIds.has(currentReel.author_id)}
            onToggleLike={() => void toggleLike(currentReel)}
            onQuickFollow={() => void quickFollow(currentReel)}
            onOpenComments={() => onOpenComments(currentReel)}
            onOpenShare={() => onOpenShare(currentReel)}
            onOpenGift={() => onOpenGift(currentReel)}
            onOpenProfile={() => onOpenProfile(currentReel)}
            onNavigateSound={onNavigateSound}
            onUseReelAudio={() => onUseReelAudio(currentReel)}
            onUseThisSound={() => onUseThisSound(currentReel)}
            onSponsoredCta={() => void openSponsoredCta(currentReel)}
          />
        </View>
      ) : null}
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
          badgePlayCycle={badgePlayCycle}
          heartScale={heartScale}
          heartOpacity={heartOpacity}
          progressPanHandlers={progressPan.panHandlers}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { height: reelHeight },
          usePhoneFrame && { width: reelWidth, alignSelf: 'flex-start' },
        ]}
        pointerEvents="none"
      >
        <ReelGiftBurst burst={giftBurst} onDone={() => setGiftBurst(null)} />
      </View>
      </View>

      <ReelGiftSheet
        visible={Boolean(giftReel)}
        reel={giftReel}
        balanceCoins={wallet.balance_coins}
        onClose={() => setGiftReel(null)}
        onSent={handleGiftSent}
        onBuyCoins={() => {
          setGiftReel(null);
          setBuyCoinsOpen(true);
        }}
      />

      <ReelBuyCoinsSheet
        visible={buyCoinsOpen}
        onClose={() => setBuyCoinsOpen(false)}
        onPurchased={(balanceCoins) => setBalanceCoins(balanceCoins)}
      />

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
                reelAuthorId={openComments.author_id}
                onClose={closeSheets}
                onCommentAdded={() => applyLocalCommentChange(openComments.id, 1)}
                onCommentRemoved={(removedCount) =>
                  applyLocalCommentChange(openComments.id, -removedCount)
                }
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
                          void (async () => {
                            const result = await retryReelUploadTask(task.id);
                            if (!result.ok) {
                              Alert.alert('Uploads', result.reason);
                              return;
                            }
                            if (result.action === 'moved_to_draft') {
                              Alert.alert(
                                'Saved as draft',
                                `Upload failed ${MAX_UPLOAD_RETRIES} times. "${result.label}" was moved to drafts — open it from your profile grid to try again.`
                              );
                              return;
                            }
                            if (result.retriesLeft === 0) {
                              Alert.alert(
                                'Last retry',
                                'If this fails again, the upload will be moved to drafts.'
                              );
                            }
                          })();
                        }}
                      >
                        <Ionicons name="refresh" size={14} color="#fff" />
                        <Text style={styles.uploadRetryText}>
                          {(task.retryCount ?? 0) >= MAX_UPLOAD_RETRIES
                            ? 'Save draft'
                            : `Retry${task.retryCount ? ` (${task.retryCount}/${MAX_UPLOAD_RETRIES})` : ''}`}
                        </Text>
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
    overflow: 'hidden',
    flex: undefined,
    borderRadius: 16,
  },
  center: { justifyContent: 'center', alignItems: 'center' },
  reelContainer: { position: 'relative', backgroundColor: '#000', overflow: 'hidden' },
  reelContainerDesktop: { borderRadius: 16, overflow: 'hidden' },
  videoTouchLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    touchAction: 'pan-y',
  } as object,
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
    minHeight: 40,
    position: 'relative',
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
    zIndex: 2,
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
  feedPillsCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
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
  feedPill: { paddingBottom: 4 },
  feedPillActiveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  feedPillText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
  /** Sit in the engagement gutter to the right of the phone-frame video. */
  volumeControlDesktop: {
    right: 6,
    top: 56,
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
    right: REEL_ACTION_RAIL_RIGHT,
    alignItems: 'center',
    zIndex: 25,
    elevation: 25,
  },
  actionButtonsDesktop: {
    right: REEL_ACTION_RAIL_RIGHT,
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
