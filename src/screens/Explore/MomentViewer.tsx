import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type MomentAuthorFeedDTO } from '../../lib/api';
import { notifyRealtimeTopic } from '../../lib/realtimeHub';
import { getTextBackground } from '../../lib/momentTextBackgrounds';
import { isHlsUrl, isImageReelUrl } from '../../lib/reelPlayback';
import { ReelPlayer, type ReelPlayerHandle } from '../../components/ReelPlayer';
import { WebHlsVideo } from '../Reel/WebHlsVideo';
import {
  momentToSoundPlayback,
  reelNeedsOverlaySound,
  reelVideoVoiceVolume,
  useReelSoundPlayback,
} from '../../hooks/useReelSoundPlayback';
import { dedupeMomentSlides } from '../../lib/momentSlides';
import { navigateToReelPreview } from '../../navigation/navigateToChat';
import { MomentViewersSheet } from './MomentViewersSheet';
import {
  CaptionChoiceModal,
  captionChoiceToApi,
  type CaptionChoiceResult,
} from '../../components/CaptionChoiceModal';

const IMAGE_DURATION_MS = 6000;
const TEXT_DURATION_MS = 9000;
const PROGRESS_TICK_MS = 50;
const FOOTER_COLLAPSED_HEIGHT = 52;
const FOOTER_REPLY_HEIGHT = 58;

type ComposerMode = 'reply' | null;

const C = {
  primary: '#007AFF',
};

type Props = {
  visible: boolean;
  author: MomentAuthorFeedDTO | null;
  myProfileId: string | null;
  onClose: () => void;
  /** Called when the last slide of the current author finishes (more authors may follow). */
  onAdvanceAuthor?: () => void;
  onSlideViewed: (authorId: string, slideId: string) => void;
  onSlideDeleted?: (authorId: string, slideId: string) => void;
};

function authorName(author: MomentAuthorFeedDTO['author']): string {
  return author.display_name?.trim() || author.email?.split('@')[0] || 'User';
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return 'Earlier';
}

function slideDuration(slide?: { media_type: string; media_url?: string | null } | null): number {
  if (!slide) return IMAGE_DURATION_MS;
  if (slide.media_type === 'text') return TEXT_DURATION_MS;
  if (slide.media_type === 'reel' && slide.media_url && !isImageReelUrl(slide.media_url)) {
    return IMAGE_DURATION_MS;
  }
  if (slide.media_type === 'video') return IMAGE_DURATION_MS;
  return IMAGE_DURATION_MS;
}

function isSlideVideo(slide?: { media_type: string; media_url?: string | null } | null): boolean {
  if (!slide) return false;
  if (slide.media_type === 'video') return true;
  if (slide.media_type === 'reel' && slide.media_url) {
    return !isImageReelUrl(slide.media_url);
  }
  return false;
}

export function MomentViewer({
  visible,
  author,
  myProfileId,
  onClose,
  onAdvanceAuthor,
  onSlideViewed,
  onSlideDeleted,
}: Props) {
  const insets = useSafeAreaInsets();
  const footerPad = insets.bottom + 12;
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [composerText, setComposerText] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [sendingComposer, setSendingComposer] = useState(false);
  const composerOpen = composerMode !== null;
  const footerHeight = composerOpen ? FOOTER_REPLY_HEIGHT : FOOTER_COLLAPSED_HEIGHT;
  const contentBottomPad = footerPad + footerHeight + 8;

  const [slideIndex, setSlideIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<'comments' | 'views'>('comments');
  const [savingReel, setSavingReel] = useState(false);
  const [reelCaptionOpen, setReelCaptionOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const composerInputRef = useRef<TextInput>(null);
  const pausedForCaptionRef = useRef(false);
  const pausedForDeleteRef = useRef(false);

  const videoRef = useRef<ReelPlayerHandle>(null);
  const imageStartRef = useRef(Date.now());
  const imageElapsedRef = useRef(0);
  const [videoDurationSec, setVideoDurationSec] = useState(IMAGE_DURATION_MS / 1000);

  const slides = useMemo(
    () => dedupeMomentSlides(author?.slides ?? []),
    [author?.slides]
  );
  const currentSlide = slides[slideIndex];
  const isOwner = author?.author.id === myProfileId;
  const frozen =
    activityOpen ||
    composerFocused ||
    sendingComposer ||
    reelCaptionOpen ||
    composerOpen ||
    deleting ||
    deleteConfirmOpen;
  const isPaused = paused || holding || frozen;
  const videoShouldPlay = visible && !isPaused && Boolean(currentSlide);
  const soundClipSec =
    currentSlide?.media_type === 'image'
      ? IMAGE_DURATION_MS / 1000
      : Math.max(1, videoDurationSec);
  const soundSource = useMemo(
    () => (currentSlide ? momentToSoundPlayback(currentSlide, soundClipSec) : null),
    [currentSlide, soundClipSec]
  );
  const overlaySoundActive = reelNeedsOverlaySound(soundSource);
  const videoVoiceVolume = soundSource ? reelVideoVoiceVolume(soundSource) : 1;

  useReelSoundPlayback(soundSource, {
    active: visible && overlaySoundActive,
    playing: visible && !isPaused && !frozen,
    muted: false,
    focused: visible,
  });

  const goNext = useCallback(() => {
    if (frozen) return;
    if (!author) return;
    if (slideIndex < slides.length - 1) {
      setSlideIndex((i) => i + 1);
    } else if (onAdvanceAuthor) {
      onAdvanceAuthor();
    } else {
      onClose();
    }
  }, [slides.length, slideIndex, onClose, onAdvanceAuthor, frozen, author]);

  const goPrev = useCallback(() => {
    if (frozen) return;
    if (slideIndex > 0) setSlideIndex((i) => i - 1);
  }, [slideIndex, frozen]);

  useEffect(() => {
    if (visible) {
      setPaused(false);
    }
  }, [visible, author?.author.id]);

  useEffect(() => {
    if (!visible) {
      void videoRef.current?.pauseAsync();
      setSlideIndex(0);
      setProgress(0);
      setPaused(true);
      setHolding(false);
      setActivityOpen(false);
      setComposerFocused(false);
      setComposerMode(null);
      setReelCaptionOpen(false);
      setDeleteConfirmOpen(false);
      setComposerText('');
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !author) return;
    setSlideIndex(0);
    setProgress(0);
    setPaused(false);
    setHolding(false);
    setComposerMode(null);
    setVideoDurationSec(IMAGE_DURATION_MS / 1000);
    imageElapsedRef.current = 0;
    imageStartRef.current = Date.now();
  }, [visible, author?.author.id]);

  useEffect(() => {
    setProgress(0);
    setVideoDurationSec(IMAGE_DURATION_MS / 1000);
    imageElapsedRef.current = 0;
    imageStartRef.current = Date.now();
  }, [slideIndex, currentSlide?.id]);

  useEffect(() => {
    if (!visible || !author || !currentSlide) return;
    if (!currentSlide.viewed_by_me) {
      onSlideViewed(author.author.id, currentSlide.id);
    }
  }, [visible, author, currentSlide, onSlideViewed]);

  useEffect(() => {
    if (!isPaused && currentSlide && !isSlideVideo(currentSlide)) {
      imageStartRef.current = Date.now();
    }
  }, [isPaused, currentSlide]);

  useEffect(() => {
    if (!visible || !currentSlide || isSlideVideo(currentSlide) || isPaused) return;

    const durationMs = slideDuration(currentSlide);
    const tick = () => {
      const elapsed = imageElapsedRef.current + (Date.now() - imageStartRef.current);
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);
      if (elapsed >= durationMs) goNext();
    };

    imageStartRef.current = Date.now();
    const id = setInterval(tick, PROGRESS_TICK_MS);
    return () => clearInterval(id);
  }, [visible, currentSlide, isPaused, goNext]);

  useEffect(() => {
    if (!isPaused || !currentSlide || isSlideVideo(currentSlide)) return;
    imageElapsedRef.current += Date.now() - imageStartRef.current;
  }, [isPaused, currentSlide]);

  const openLinkedReel = useCallback(() => {
    const reelId = currentSlide?.reel_id ?? currentSlide?.reel?.id;
    if (!reelId) return;
    setPaused(true);
    navigateToReelPreview(reelId);
  }, [currentSlide?.reel_id, currentSlide?.reel?.id]);

  const handleVideoStatus = useCallback(
    (status: {
      positionMillis?: number;
      durationMillis?: number;
      didJustFinish?: boolean;
    }) => {
      if (isPaused) return;
      if (status.durationMillis && status.durationMillis > 0) {
        setVideoDurationSec(status.durationMillis / 1000);
      }
      const duration = status.durationMillis || videoDurationSec * 1000;
      const position = status.positionMillis ?? 0;
      if (duration > 0) {
        setProgress(Math.min(100, (position / duration) * 100));
      }
      if (status.didJustFinish && !isPaused) goNext();
    },
    [goNext, isPaused, videoDurationSec]
  );

  const sendComposer = async () => {
    if (!currentSlide || !composerText.trim() || sendingComposer || composerMode !== 'reply') return;
    setSendingComposer(true);
    try {
      await api.moments.reply(currentSlide.id, composerText.trim(), undefined, { to_chat: true });
      setComposerText('');
      Keyboard.dismiss();
      setComposerMode(null);
      setComposerFocused(false);
      setPaused(false);
    } catch {
      Alert.alert('Reply', 'Could not send your reply. Try again.');
    } finally {
      setSendingComposer(false);
    }
  };

  const openReplyComposer = () => {
    if (isOwner) return;
    setPaused(true);
    void videoRef.current?.pauseAsync();
    setComposerMode('reply');
  };

  const openActivitySheet = (tab: 'comments' | 'views') => {
    setPaused(true);
    void videoRef.current?.pauseAsync();
    setActivityTab(tab);
    setActivityOpen(true);
  };

  const closeComposer = () => {
    setComposerMode(null);
    setComposerFocused(false);
    setComposerText('');
    Keyboard.dismiss();
  };

  useEffect(() => {
    if (composerMode) {
      const t = setTimeout(() => composerInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [composerMode]);

  const openReelCaptionModal = () => {
    if (!isPaused) {
      pausedForCaptionRef.current = true;
      setPaused(true);
    } else {
      pausedForCaptionRef.current = false;
    }
    void videoRef.current?.pauseAsync();
    setReelCaptionOpen(true);
  };

  const closeReelCaptionModal = () => {
    setReelCaptionOpen(false);
    if (pausedForCaptionRef.current) {
      setPaused(false);
      pausedForCaptionRef.current = false;
    }
  };

  const openViewers = () => openActivitySheet('views');

  const closeActivity = () => {
    setActivityOpen(false);
  };

  const openDeleteConfirm = () => {
    if (!currentSlide || !isOwner || deleting || deleteConfirmOpen) return;
    pausedForDeleteRef.current = !paused;
    setPaused(true);
    void videoRef.current?.pauseAsync();
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = (resume = true) => {
    setDeleteConfirmOpen(false);
    if (resume && pausedForDeleteRef.current) {
      setPaused(false);
    }
    pausedForDeleteRef.current = false;
  };

  const confirmDeleteMoment = async () => {
    if (!currentSlide || !author || !isOwner || deleting) return;
    setDeleting(true);
    try {
      await api.moments.delete(currentSlide.id);
      notifyRealtimeTopic('moments');
      const authorId = author.author.id;
      const slideId = currentSlide.id;
      const remaining = slides.length - 1;
      setDeleteConfirmOpen(false);
      pausedForDeleteRef.current = false;
      onSlideDeleted?.(authorId, slideId);
      if (remaining <= 0) {
        onClose();
      } else if (slideIndex >= remaining) {
        setSlideIndex(remaining - 1);
        setPaused(false);
      } else {
        setPaused(false);
      }
    } catch {
      Alert.alert('Delete', 'Could not delete this moment.');
      closeDeleteConfirm(true);
    } finally {
      setDeleting(false);
    }
  };

  const saveAsReel = async (result: CaptionChoiceResult) => {
    closeReelCaptionModal();
    if (!currentSlide || savingReel || result.action === 'cancel') return;
    if (currentSlide.media_type !== 'image' && currentSlide.media_type !== 'video') return;

    const caption = captionChoiceToApi(result);
    if (caption === null) return;

    setSavingReel(true);
    try {
      await api.reels.fromMoment(
        currentSlide.id,
        caption !== undefined ? { caption } : {}
      );
      Alert.alert('Saved as reel', 'Your moment is now on your reels profile (friends only).');
    } catch {
      Alert.alert('Reel', 'Could not save this moment as a reel.');
    } finally {
      setSavingReel(false);
    }
  };

  if (!author || !currentSlide) return null;

  const canSaveAsReel =
    isOwner &&
    (currentSlide.media_type === 'image' || currentSlide.media_type === 'video');

  const textBg = getTextBackground(currentSlide.text_background);
  const footerCaption = currentSlide.caption?.trim() || null;
  const canInteract = !isOwner;
  const reelRef = currentSlide.reel;
  const reelLinkLabel = reelRef?.author_name
    ? `View reel · @${reelRef.author_name}`
    : 'View original reel';

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.viewer}>
        <View style={[styles.viewerProgressRow, { paddingTop: insets.top + 8 }]}>
          {slides.map((s, i) => (
            <View key={`${s.id}-${i}`} style={styles.viewerProgressTrack}>
              <View
                style={[
                  styles.viewerProgressFill,
                  {
                    width: `${i < slideIndex ? 100 : i === slideIndex ? progress : 0}%`,
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.viewerHeader}>
          <TouchableOpacity onPress={onClose} style={styles.viewerIconBtn}>
            <Ionicons name="chevron-down" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.viewerUser}>
            {author.author.avatar_url ? (
              <Image source={{ uri: author.author.avatar_url }} style={styles.viewerAvatar} />
            ) : (
              <View style={[styles.viewerAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>{authorName(author.author).charAt(0)}</Text>
              </View>
            )}
            <View>
              <Text style={styles.viewerName}>{authorName(author.author)}</Text>
              <Text style={styles.viewerTime}>
                {formatTimeAgo(currentSlide.created_at)}
                {slides.length > 1 ? ` · ${slideIndex + 1}/${slides.length}` : ''}
              </Text>
            </View>
          </View>
          {isOwner ? (
            <>
              {canSaveAsReel ? (
                <TouchableOpacity
                  style={styles.viewerIconBtn}
                  onPress={openReelCaptionModal}
                  disabled={savingReel || deleting}
                >
                  <Ionicons
                    name={savingReel ? 'hourglass-outline' : 'film-outline'}
                    size={22}
                    color="#fff"
                  />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.viewerIconBtn}
                onPress={openDeleteConfirm}
                disabled={deleting || deleteConfirmOpen}
              >
                <Ionicons
                  name={deleting ? 'hourglass-outline' : 'trash-outline'}
                  size={22}
                  color="#fff"
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.viewerIconBtn} onPress={openViewers}>
              <Ionicons name="eye-outline" size={22} color="#fff" />
              {(currentSlide.view_count ?? 0) > 0 && (
                <View style={styles.viewCountBadge}>
                  <Text style={styles.viewCountText}>
                    {currentSlide.view_count! > 99 ? '99+' : currentSlide.view_count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            </>
          ) : currentSlide.view_once ? (
            <View style={styles.viewerOncePill}>
              <Ionicons name="eye-off-outline" size={12} color="#fff" />
            </View>
          ) : (
            <View style={styles.viewerIconBtn} />
          )}
        </View>

        <Pressable
          style={[styles.viewerBody, { paddingBottom: contentBottomPad }]}
          onPress={() => {
            if (frozen) return;
            setPaused((p) => !p);
          }}
          onPressIn={() => {
            if (!frozen) setHolding(true);
          }}
          onPressOut={() => setHolding(false)}
        >
          {currentSlide.media_type === 'text' ? (
            <LinearGradient
              colors={[...textBg.colors]}
              style={styles.viewerMedia}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text
                style={[
                  styles.textMomentBody,
                  textBg.darkText && styles.textMomentBodyDark,
                ]}
              >
                {currentSlide.caption}
              </Text>
            </LinearGradient>
          ) : isSlideVideo(currentSlide) && currentSlide.media_url && visible ? (
            Platform.OS === 'web' && isHlsUrl(currentSlide.media_url) ? (
              <WebHlsVideo
                key={currentSlide.id}
                uri={currentSlide.media_url}
                style={styles.viewerMedia}
                muted={overlaySoundActive}
                shouldPlay={videoShouldPlay}
              />
            ) : (
              <ReelPlayer
                key={currentSlide.id}
                ref={videoRef}
                source={currentSlide.media_url}
                style={styles.viewerMedia}
                contentFit="cover"
                shouldPlay={videoShouldPlay}
                isLooping={false}
                isMuted={overlaySoundActive}
                volume={overlaySoundActive ? videoVoiceVolume : 1}
                progressUpdateIntervalMillis={100}
                onPlaybackStatusUpdate={handleVideoStatus}
              />
            )
          ) : currentSlide.media_url ? (
            <Image
              source={{ uri: currentSlide.media_url }}
              style={styles.viewerMedia}
              resizeMode="cover"
            />
          ) : null}

          {isPaused && !frozen && (
            <View style={styles.pauseBadge}>
              <Ionicons name="pause" size={36} color="#fff" />
            </View>
          )}

          {currentSlide.media_type === 'reel' && (currentSlide.reel_id || reelRef) ? (
            <TouchableOpacity style={styles.reelLinkChip} onPress={openLinkedReel} activeOpacity={0.85}>
              <Ionicons name="film-outline" size={16} color="#fff" />
              <Text style={styles.reelLinkText} numberOfLines={1}>
                {reelLinkLabel}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          ) : null}
        </Pressable>

        {!frozen && (
          <>
            <TouchableOpacity
              style={[styles.viewerTap, styles.viewerTapLeft, { bottom: contentBottomPad }]}
              onPress={goPrev}
              onLongPress={() => setHolding(true)}
              onPressOut={() => setHolding(false)}
              delayLongPress={120}
            />
            <TouchableOpacity
              style={[styles.viewerTap, styles.viewerTapRight, { bottom: contentBottomPad }]}
              onPress={goNext}
              onLongPress={() => setHolding(true)}
              onPressOut={() => setHolding(false)}
              delayLongPress={120}
            />
          </>
        )}

        <View style={[styles.viewerFooter, { paddingBottom: footerPad, minHeight: footerHeight }]}>
          {composerMode ? (
            <>
              <TouchableOpacity style={styles.viewerReplyClose} onPress={closeComposer}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
              <TextInput
                ref={composerInputRef}
                style={styles.viewerReply}
                placeholder="Reply…"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={composerText}
                onChangeText={setComposerText}
                onFocus={() => {
                  setComposerFocused(true);
                  setPaused(true);
                }}
                onBlur={() => setComposerFocused(false)}
                onSubmitEditing={() => void sendComposer()}
                editable={!sendingComposer}
              />
              <TouchableOpacity
                style={styles.viewerReactBtn}
                onPress={() => void sendComposer()}
                disabled={!composerText.trim() || sendingComposer}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.footerCaption} numberOfLines={2}>
                {footerCaption ?? ''}
              </Text>
              {canInteract ? (
                <View style={styles.footerActions}>
                  <TouchableOpacity
                    style={styles.viewerReplyIconBtn}
                    onPress={() => openActivitySheet('comments')}
                    accessibilityLabel="View comments"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chatbubble-outline" size={22} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.viewerReplyIconBtn}
                    onPress={openReplyComposer}
                    accessibilityLabel="Reply in chat"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-undo-outline" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.viewerReplyIconBtn}
                  onPress={() => openActivitySheet('comments')}
                  accessibilityLabel="View comments and views"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chatbubbles-outline" size={22} color="#fff" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <CaptionChoiceModal
          visible={reelCaptionOpen}
          title="Caption for your reel"
          originalCaption={currentSlide.caption}
          onClose={closeReelCaptionModal}
          onConfirm={(result) => void saveAsReel(result)}
        />

        <MomentViewersSheet
          visible={activityOpen}
          momentId={currentSlide.id}
          isOwner={isOwner}
          initialTab={activityTab}
          onClose={closeActivity}
        />

        {deleteConfirmOpen ? (
          <View style={styles.deleteConfirmRoot} pointerEvents="box-none">
            <Pressable
              style={styles.deleteConfirmScrim}
              onPress={() => {
                if (!deleting) closeDeleteConfirm(true);
              }}
            />
            <View style={[styles.deleteConfirmToast, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
              <Text style={styles.deleteConfirmTitle}>Delete this moment?</Text>
              <Text style={styles.deleteConfirmSub}>It will be removed for everyone.</Text>
              <View style={styles.deleteConfirmActions}>
                <TouchableOpacity
                  style={styles.deleteCancelBtn}
                  onPress={() => closeDeleteConfirm(true)}
                  disabled={deleting}
                  activeOpacity={0.85}
                >
                  <Text style={styles.deleteCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteConfirmBtn, deleting && { opacity: 0.7 }]}
                  onPress={() => void confirmDeleteMoment()}
                  disabled={deleting}
                  activeOpacity={0.85}
                >
                  {deleting ? (
                    <Text style={styles.deleteConfirmText}>Deleting…</Text>
                  ) : (
                    <>
                      <Ionicons name="trash" size={15} color="#fff" />
                      <Text style={styles.deleteConfirmText}>Delete</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerProgressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingBottom: 8,
    zIndex: 10,
  },
  viewerProgressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  viewerProgressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    zIndex: 10,
  },
  viewerIconBtn: { padding: 8, width: 44, alignItems: 'center' },
  viewerUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewerAvatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: {
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 16 },
  viewerName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  viewerTime: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  viewCountBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  viewCountText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  viewerOncePill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 6,
    marginRight: 8,
  },
  viewerBody: { flex: 1 },
  viewerMedia: { width: '100%', height: '100%' },
  textMomentBody: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 36,
    paddingHorizontal: 28,
  },
  textMomentBodyDark: { color: '#1c1c1e' },
  pauseBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  viewerCaptionBox: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.primary,
  },
  viewerCaptionText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  reelLinkChip: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  reelLinkText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700' },
  viewerTap: { position: 'absolute', top: 100, width: '28%', zIndex: 5 },
  viewerTapLeft: { left: 0 },
  viewerTapRight: { right: 0 },
  viewerFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 8,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  footerCaption: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 8,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  viewerReplyIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  viewerReplyClose: {
    padding: 6,
  },
  viewerReply: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  viewerReactBtn: { padding: 8 },
  deleteConfirmRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  deleteConfirmScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  deleteConfirmToast: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
  },
  deleteConfirmTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  deleteConfirmSub: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 14,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 4,
  },
  deleteCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2c2c2e',
  },
  deleteCancelText: { color: '#ddd', fontWeight: '700', fontSize: 13 },
  deleteConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#dc2626',
  },
  deleteConfirmText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
