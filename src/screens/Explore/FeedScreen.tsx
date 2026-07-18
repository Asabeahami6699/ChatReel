import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SoftFadeImage } from '../../components/SoftFadeImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type MomentAuthorFeedDTO, type MomentSlideDTO } from '../../lib/api';
import {
  getMomentVideoThumbnailUri,
  peekMomentVideoThumbnailUri,
} from '../../lib/momentVideoThumbnail';
import { getExploreProfileCache } from '../../lib/momentsFeedPrefetch';
import { useMomentsFeed } from '../../hooks/useMomentsFeed';
import { useIsFocused } from '@react-navigation/native';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { useAuth } from '../../hooks/useAuth';
import { promptSignIn } from '../../lib/requireSignedIn';
import { MomentComposer, type MomentDraft, type MomentDraftItem } from './MomentComposer';
import { MomentViewer } from './MomentViewer';
import { getTextBackground } from '../../lib/momentTextBackgrounds';
import { CircularProgressRing } from '../../components/CircularProgressRing';
import {
  dismissMomentUpload,
  retryMomentUpload,
  subscribeMomentUploadQueue,
  type MomentUploadTask,
} from '../../lib/momentUploadQueue';

const C = {
  primary: '#007AFF',
  primaryDark: '#1e73ce',
  primarySoft: '#e8f2ff',
  bg: '#ffffff',
  surface: '#f4f8fc',
  border: '#e2eaf3',
  text: '#1c1c1e',
  muted: '#6b7280',
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

function momentPreviewUri(slide: MomentSlideDTO): string | null {
  if (slide.media_type === 'video') {
    return slide.thumbnail_url ?? peekMomentVideoThumbnailUri(slide.id);
  }
  if (slide.media_type === 'image') return slide.media_url;
  if (slide.media_type === 'reel') {
    return slide.reel?.thumbnail_url ?? slide.media_url;
  }
  return null;
}

function MomentSlidePreview({
  slide,
  style,
}: {
  slide: MomentSlideDTO;
  style: object;
}) {
  const [videoThumb, setVideoThumb] = useState<string | null>(
    slide.thumbnail_url ?? peekMomentVideoThumbnailUri(slide.id)
  );

  useEffect(() => {
    if (slide.media_type !== 'video' || slide.thumbnail_url || !slide.media_url) return;
    let cancelled = false;
    void getMomentVideoThumbnailUri(slide.id, slide.media_url).then((uri) => {
      if (!cancelled && uri) setVideoThumb(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [slide.id, slide.media_type, slide.media_url, slide.thumbnail_url]);

  if (slide.media_type === 'text') {
    const bg = getTextBackground(slide.text_background);
    return (
      <LinearGradient
        colors={[...bg.colors]}
        style={style}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text
          style={[styles.textPreviewLabel, bg.darkText && styles.textPreviewLabelDark]}
          numberOfLines={3}
        >
          {slide.caption || '…'}
        </Text>
      </LinearGradient>
    );
  }

  if (slide.media_type === 'reel') {
    const thumb = momentPreviewUri(slide);
    if (thumb) {
      return (
        <View style={style}>
          <SoftFadeImage uri={thumb} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={styles.reelPreviewBadge}>
            <Ionicons name="film-outline" size={14} color="#fff" />
          </View>
        </View>
      );
    }
    return <View style={[style, styles.videoThumbFallback]} />;
  }

  if (slide.media_type === 'video') {
    const thumb = slide.thumbnail_url ?? videoThumb;
    if (thumb) {
      return (
        <View style={style}>
          <SoftFadeImage uri={thumb} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={styles.videoPreviewPlay}>
            <Ionicons name="play" size={16} color="#fff" />
          </View>
        </View>
      );
    }
    return (
      <View style={[style, styles.videoThumbFallback]}>
        <Ionicons name="videocam-outline" size={22} color="rgba(255,255,255,0.85)" />
      </View>
    );
  }

  if (slide.media_url) {
    return <SoftFadeImage uri={slide.media_url} style={style} resizeMode="cover" />;
  }

  return <View style={[style, styles.videoThumbFallback]} />;
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const isScreenFocused = useIsFocused();
  const { isGuest, exitGuest } = useAuth();
  const myProfileId = useCurrentProfileId();
  const { authors, loading, refreshing, error, refresh, markSlideViewed, removeSlide } =
    useMomentsFeed();

  const [myProfile, setMyProfile] = useState<{
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null>(() => (isGuest ? null : getExploreProfileCache()));

  const [composerDraft, setComposerDraft] = useState<MomentDraft | null>(null);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<MomentUploadTask[]>([]);

  const requireAuth = useCallback(
    (message?: string) => {
      if (!isGuest) return true;
      promptSignIn({
        title: 'Sign in required',
        message: message ?? 'Sign in to use Moments, or continue exploring as a guest.',
        onLogin: exitGuest,
      });
      return false;
    },
    [isGuest, exitGuest]
  );

  useEffect(() => {
    if (isGuest) return;
    return subscribeMomentUploadQueue((tasks) => {
      setUploadTasks(tasks.filter((t) => t.status !== 'done'));
    });
  }, [isGuest]);

  const renderSlidePreview = (slide: MomentSlideDTO, style: object) => (
    <MomentSlidePreview slide={slide} style={style} />
  );

  useEffect(() => {
    if (isGuest || myProfile) return;
    api.profiles
      .me()
      .then(({ profile }) => {
        setMyProfile({
          display_name: (profile?.display_name as string) ?? null,
          email: (profile?.email as string) ?? null,
          avatar_url: (profile?.avatar_url as string) ?? null,
        });
      })
      .catch(() => undefined);
  }, [isGuest, myProfile]);

  const myFeed = useMemo(
    () => authors.find((a) => a.author.id === myProfileId) ?? null,
    [authors, myProfileId]
  );

  const othersNew = useMemo(
    () => authors.filter((a) => a.author.id !== myProfileId && a.has_unseen),
    [authors, myProfileId]
  );

  const othersSeen = useMemo(
    () => authors.filter((a) => a.author.id !== myProfileId && !a.has_unseen),
    [authors, myProfileId]
  );

  const stripAuthors = useMemo(() => {
    const byId = new Map<string, MomentAuthorFeedDTO>();

    if (myProfileId) {
      byId.set(
        myProfileId,
        myFeed ?? {
          author: {
            id: myProfileId,
            user_id: '',
            display_name: myProfile?.display_name ?? null,
            email: myProfile?.email ?? null,
            avatar_url: myProfile?.avatar_url ?? null,
          },
          slides: [],
          has_unseen: false,
          latest_at: '',
        }
      );
    }

    for (const a of authors) {
      if (!byId.has(a.author.id)) byId.set(a.author.id, a);
    }

    const ordered: MomentAuthorFeedDTO[] = [];
    if (myProfileId && byId.has(myProfileId)) {
      ordered.push(byId.get(myProfileId)!);
    }
    for (const a of authors) {
      if (a.author.id !== myProfileId && byId.has(a.author.id)) {
        ordered.push(byId.get(a.author.id)!);
        byId.delete(a.author.id);
      }
    }
    return ordered;
  }, [authors, myFeed, myProfileId, myProfile]);

  const viewerQueue = useMemo(
    () => stripAuthors.filter((a) => a.slides.length > 0),
    [stripAuthors]
  );

  const viewerAuthor = viewerIndex >= 0 ? (viewerQueue[viewerIndex] ?? null) : null;
  const viewerHasNextAuthor =
    viewerIndex >= 0 && viewerIndex < viewerQueue.length - 1;

  const appendDraftItems = useCallback((newItems: MomentDraftItem[]) => {
    if (!newItems.length) return;
    setComposerDraft((prev) => ({
      items: [...(prev?.items ?? []), ...newItems],
    }));
  }, []);

  const updateDraftItem = useCallback((index: number, patch: Partial<MomentDraftItem>) => {
    setComposerDraft((prev) => {
      if (!prev?.items[index]) return prev;
      const items = [...prev.items];
      items[index] = { ...items[index], ...patch };
      return { items };
    });
  }, []);

  const runAddAction = useCallback(async (action: () => Promise<void>) => {
    setAddMenuOpen(false);
    await action();
  }, []);

  const assetToDraftItem = (asset: ImagePicker.ImagePickerAsset): MomentDraftItem => ({
    uri: asset.uri,
    mediaType: asset.type === 'video' ? 'video' : 'image',
    fileName: asset.fileName ?? undefined,
    mime: asset.mimeType ?? undefined,
  });

  const pickFromGallery = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow gallery access to pick moments.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
        allowsMultipleSelection: true,
        selectionLimit: 30,
        quality: 0.9,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.length) return;
      appendDraftItems(result.assets.map(assetToDraftItem));
    } catch {
      Alert.alert('Gallery', 'Could not open the gallery. Please try again.');
    }
  }, [appendDraftItems]);

  const takePhoto = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Camera', 'Taking photos is not supported on web. Use Gallery instead.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to take a photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'] as ImagePicker.MediaType[],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      appendDraftItems([assetToDraftItem(result.assets[0])]);
    } catch {
      Alert.alert('Camera', 'Could not open the camera. Please try again.');
    }
  }, [appendDraftItems]);

  const recordVideo = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Camera', 'Recording video is not supported on web. Use Gallery instead.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to record a video.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'] as ImagePicker.MediaType[],
        allowsEditing: false,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.[0]) return;
      appendDraftItems([assetToDraftItem(result.assets[0])]);
    } catch {
      Alert.alert('Camera', 'Could not open the camera. Please try again.');
    }
  }, [appendDraftItems]);

  const addTextMoment = useCallback(async () => {
    appendDraftItems([
      {
        mediaType: 'text',
        textBackground: 'ocean',
        caption: '',
      },
    ]);
  }, [appendDraftItems]);

  const openAddMenu = useCallback(() => {
    if (!requireAuth('Sign in to post a moment.')) return;
    setAddMenuOpen(true);
  }, [requireAuth]);

  const openAuthor = useCallback((author: MomentAuthorFeedDTO) => {
    if (!requireAuth('Sign in to view moments from friends.')) return;
    if (author.author.id === myProfileId && author.slides.length === 0) {
      openAddMenu();
      return;
    }
    if (!author.slides.length) return;
    const idx = viewerQueue.findIndex((a) => a.author.id === author.author.id);
    setViewerIndex(idx >= 0 ? idx : 0);
  }, [myProfileId, openAddMenu, viewerQueue, requireAuth]);

  const closeViewer = useCallback(() => {
    setViewerIndex(-1);
  }, []);

  const advanceViewerAuthor = useCallback(() => {
    setViewerIndex((idx) => {
      if (idx < 0) return idx;
      if (idx < viewerQueue.length - 1) return idx + 1;
      return -1;
    });
  }, [viewerQueue.length]);

  const handleSlideViewed = useCallback(
    async (authorId: string, slideId: string) => {
      if (isGuest) return;
      markSlideViewed(authorId, slideId);
      try {
        await api.moments.view(slideId);
      } catch {
        /* ignore */
      }
    },
    [isGuest, markSlideViewed]
  );

  const renderBubble = (item: MomentAuthorFeedDTO) => {
    const isMe = item.author.id === myProfileId;
    const isNew = !isMe && item.has_unseen;
    const preview = item.slides[item.slides.length - 1];

    return (
      <TouchableOpacity
        style={styles.bubbleWrap}
        onPress={() => openAuthor(item)}
        activeOpacity={0.85}
      >
        {isNew ? (
          <LinearGradient colors={[C.primary, '#5ac8fa']} style={styles.bubbleRing}>
            <View style={styles.bubbleInner}>
              {preview ? (
                renderSlidePreview(preview, styles.bubbleImage)
              ) : item.author.avatar_url ? (
                <SoftFadeImage uri={item.author.avatar_url} style={styles.bubbleImage} />
              ) : (
                <View style={styles.bubbleFallback}>
                  <Text style={styles.bubbleLetter}>{authorName(item.author).charAt(0)}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        ) : (
          <View style={[styles.bubbleRing, styles.bubbleRingMuted]}>
            <View style={styles.bubbleInner}>
              {preview ? (
                renderSlidePreview(preview, styles.bubbleImage)
              ) : item.author.avatar_url ? (
                <SoftFadeImage uri={item.author.avatar_url} style={styles.bubbleImage} />
              ) : (
                <View style={styles.bubbleFallback}>
                  <Text style={styles.bubbleLetter}>{authorName(item.author).charAt(0)}</Text>
                </View>
              )}
            </View>
          </View>
        )}
        {isMe && (
          <View style={styles.bubbleAdd}>
            <Ionicons name="add" size={14} color="#fff" />
          </View>
        )}
        <Text style={styles.bubbleLabel} numberOfLines={1}>
          {isMe ? 'You' : authorName(item.author).split(' ')[0]}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderUploadBubble = (task: MomentUploadTask) => {
    const failed = task.status === 'error';
    const pct = failed ? 0 : Math.max(task.progress, task.status === 'queued' ? 4 : 0);

    return (
      <TouchableOpacity
        key={task.id}
        style={styles.bubbleWrap}
        activeOpacity={0.85}
        onPress={() => {
          if (failed) {
            retryMomentUpload(task.id);
          }
        }}
        onLongPress={() => {
          if (failed) dismissMomentUpload(task.id);
        }}
      >
        <View style={[styles.bubbleRing, failed ? styles.uploadRingFail : styles.uploadRingActive]}>
          <View style={styles.bubbleInner}>
            {task.mediaType === 'text' ? (
              <LinearGradient
                colors={[...(getTextBackground(task.textBackground).colors)]}
                style={styles.bubbleImage}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.uploadTextPreview} numberOfLines={3}>
                  {task.caption?.trim() || '…'}
                </Text>
              </LinearGradient>
            ) : task.previewUri ? (
              <Image source={{ uri: task.previewUri }} style={styles.bubbleImage} />
            ) : (
              <View style={[styles.bubbleImage, styles.uploadFallback]}>
                <Ionicons
                  name={task.mediaType === 'video' ? 'videocam' : 'image'}
                  size={22}
                  color="#fff"
                />
              </View>
            )}
            <View style={styles.uploadOverlay}>
              {failed ? (
                <View style={styles.retryBadge}>
                  <Ionicons name="refresh" size={18} color="#fff" />
                </View>
              ) : (
                <CircularProgressRing
                  progress={pct}
                  size={40}
                  strokeWidth={3}
                  color="#fff"
                  trackColor="rgba(255,255,255,0.28)"
                >
                  <Text style={styles.uploadPct}>{Math.round(pct)}%</Text>
                </CircularProgressRing>
              )}
            </View>
          </View>
        </View>
        <Text style={[styles.bubbleLabel, failed && styles.uploadLabelFail]} numberOfLines={1}>
          {failed ? 'Retry' : 'Uploading'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderListRow = (item: MomentAuthorFeedDTO) => {
    const preview = item.slides[item.slides.length - 1];
    if (!preview) return null;
    return (
      <TouchableOpacity
        style={styles.listRow}
        onPress={() => openAuthor(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.listAvatarRing, item.has_unseen && styles.listAvatarRingNew]}>
          {item.author.avatar_url ? (
            <SoftFadeImage uri={item.author.avatar_url} style={styles.listAvatar} />
          ) : (
            <View style={[styles.listAvatar, styles.bubbleFallback]}>
              <Text style={styles.bubbleLetter}>{authorName(item.author).charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={styles.listMeta}>
          <Text style={styles.listName}>{authorName(item.author)}</Text>
          <Text style={styles.listTime}>
            {formatTimeAgo(preview.created_at)}
            {item.slides.length > 1 ? ` · ${item.slides.length} moments` : ''}
            {preview.view_once ? ' · View once' : ''}
          </Text>
        </View>
        <View style={styles.listThumbWrap}>
          {renderSlidePreview(preview, styles.listThumb)}
          <View style={styles.listThumbPlay}>
            <Ionicons
              name={
                preview.media_type === 'video'
                  ? 'play'
                  : preview.media_type === 'text'
                    ? 'text'
                    : 'image'
              }
              size={12}
              color="#fff"
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={C.bg} barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />
        }
      >
        {loading && authors.length === 0 && uploadTasks.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.loadingText}>Loading moments…</Text>
          </View>
        ) : error && authors.length === 0 && uploadTasks.length === 0 ? (
          <View style={styles.loadingBox}>
            <Ionicons name="cloud-offline-outline" size={40} color={C.muted} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.stripCard}>
              <View style={styles.stripHead}>
                <Text style={styles.stripTitle}>Moments</Text>
                <Text style={styles.stripSub}>Tap to view · expires automatically</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stripScroll}
              >
                {stripAuthors.map((a, index) => (
                  <React.Fragment key={`strip-${a.author.id}`}>
                    {renderBubble(a)}
                    {index === 0 && a.author.id === myProfileId
                      ? uploadTasks.map((task) => renderUploadBubble(task))
                      : null}
                  </React.Fragment>
                ))}
                {(!myProfileId || stripAuthors.length === 0) &&
                  uploadTasks.map((task) => renderUploadBubble(task))}
              </ScrollView>
            </View>

            {myFeed && myFeed.slides.length > 0 && (
              <TouchableOpacity style={styles.youRow} onPress={() => openAuthor(myFeed)}>
                <LinearGradient
                  colors={[C.primarySoft, '#fff']}
                  style={styles.youRowGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <View style={styles.youThumbWrap}>
                    {renderSlidePreview(
                      myFeed.slides[myFeed.slides.length - 1],
                      styles.youThumb
                    )}
                  </View>
                  <View style={styles.youText}>
                    <Text style={styles.youTitle}>Your moment</Text>
                    <Text style={styles.youSub}>
                      {myFeed.slides.length} active · {formatTimeAgo(myFeed.latest_at)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.muted} />
                </LinearGradient>
              </TouchableOpacity>
            )}

            {othersNew.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionTitle}>New</Text>
                </View>
                {othersNew.map((a) => (
                  <React.Fragment key={`new-${a.author.id}`}>{renderListRow(a)}</React.Fragment>
                ))}
              </View>
            )}

            {othersSeen.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitleMuted}>Earlier</Text>
                {othersSeen.map((a) => (
                  <React.Fragment key={`seen-${a.author.id}`}>{renderListRow(a)}</React.Fragment>
                ))}
              </View>
            )}

            {!loading && authors.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="sparkles-outline" size={48} color={C.muted} />
                <Text style={styles.emptyTitle}>No moments yet</Text>
                <Text style={styles.emptySub}>
                  {isGuest
                    ? 'Sign in to see friends’ moments and post your own.'
                    : 'Post the first moment for your friends.'}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={openAddMenu}
        activeOpacity={0.9}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <LinearGradient colors={[C.primary, C.primaryDark]} style={styles.fabGrad}>
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      <MomentComposer
        visible={!!composerDraft?.items.length}
        draft={composerDraft}
        onClose={() => setComposerDraft(null)}
        onPosted={refresh}
        onAddMedia={openAddMenu}
        onUpdateItem={updateDraftItem}
      />

      <Modal visible={addMenuOpen} transparent animationType="fade" onRequestClose={() => setAddMenuOpen(false)}>
        <View style={styles.addMenuRoot}>
          <Pressable style={styles.addMenuBackdrop} onPress={() => setAddMenuOpen(false)} />
          <View style={[styles.addMenuSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.addMenuHandle} />
          <Text style={styles.addMenuTitle}>Add to moment</Text>
          <TouchableOpacity
            style={styles.addMenuRow}
            onPress={() => void runAddAction(recordVideo)}
          >
            <View style={[styles.addMenuIcon, { backgroundColor: '#e8f2ff' }]}>
              <Ionicons name="videocam" size={22} color={C.primary} />
            </View>
            <View style={styles.addMenuText}>
              <Text style={styles.addMenuLabel}>Record video</Text>
              <Text style={styles.addMenuSub}>Opens camera to record</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addMenuRow}
            onPress={() => void runAddAction(takePhoto)}
          >
            <View style={[styles.addMenuIcon, { backgroundColor: '#e8f2ff' }]}>
              <Ionicons name="camera" size={22} color={C.primary} />
            </View>
            <View style={styles.addMenuText}>
              <Text style={styles.addMenuLabel}>Take photo</Text>
              <Text style={styles.addMenuSub}>Opens camera for a photo</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addMenuRow}
            onPress={() => void runAddAction(pickFromGallery)}
          >
            <View style={[styles.addMenuIcon, { backgroundColor: '#e8f2ff' }]}>
              <Ionicons name="images" size={22} color={C.primary} />
            </View>
            <View style={styles.addMenuText}>
              <Text style={styles.addMenuLabel}>Gallery</Text>
              <Text style={styles.addMenuSub}>Pick photos or videos (multi-select)</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addMenuRow}
            onPress={() => void runAddAction(addTextMoment)}
          >
            <View style={[styles.addMenuIcon, { backgroundColor: '#e8f2ff' }]}>
              <Ionicons name="text" size={22} color={C.primary} />
            </View>
            <View style={styles.addMenuText}>
              <Text style={styles.addMenuLabel}>Words</Text>
              <Text style={styles.addMenuSub}>Text moment with a background</Text>
            </View>
          </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <MomentViewer
        visible={viewerIndex >= 0 && !!viewerAuthor && isScreenFocused}
        author={viewerAuthor}
        myProfileId={myProfileId}
        onClose={closeViewer}
        onAdvanceAuthor={viewerHasNextAuthor ? advanceViewerAuthor : undefined}
        onSlideViewed={handleSlideViewed}
        onSlideDeleted={removeSlide}
      />
    </View>
  );
}

const BUBBLE_W = 68;
const BUBBLE_H = 92;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  loadingBox: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { color: C.muted },
  errorText: { color: C.muted, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: {
    marginTop: 8,
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  stripCard: {
    backgroundColor: C.bg,
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 16,
    shadowColor: C.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  stripHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  stripTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  stripSub: { fontSize: 12, color: C.muted, fontWeight: '500' },
  stripScroll: { paddingHorizontal: 12, gap: 10 },

  bubbleWrap: { alignItems: 'center', width: BUBBLE_W + 8 },
  bubbleRing: {
    width: BUBBLE_W,
    height: BUBBLE_H,
    borderRadius: 16,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleRingMuted: { backgroundColor: '#c8d4e0', padding: 2 },
  bubbleInner: {
    flex: 1,
    width: '100%',
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  bubbleImage: { width: '100%', height: '100%' },
  bubbleFallback: {
    flex: 1,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleLetter: { color: '#fff', fontWeight: '800', fontSize: 22 },
  bubbleAdd: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.primary,
    borderWidth: 2,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    maxWidth: BUBBLE_W + 4,
    textAlign: 'center',
  },
  uploadRingActive: { backgroundColor: C.primary, padding: 3 },
  uploadRingFail: { backgroundColor: '#ef4444', padding: 3 },
  uploadFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPct: { color: '#fff', fontSize: 11, fontWeight: '800' },
  retryBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(239,68,68,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTextPreview: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    padding: 6,
  },
  uploadLabelFail: { color: '#ef4444' },

  youRow: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  youRowGrad: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  youThumbWrap: { marginRight: 12, borderRadius: 10, overflow: 'hidden' },
  youThumb: { width: 48, height: 64, borderRadius: 10 },
  textPreviewLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    padding: 4,
  },
  textPreviewLabelDark: { color: '#1c1c1e' },
  reelPreviewBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoThumbFallback: {
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPreviewPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  youText: { flex: 1 },
  youTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  youSub: { fontSize: 13, color: C.muted, marginTop: 2 },

  section: { marginTop: 20, paddingHorizontal: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  sectionTitleMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  listAvatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#c8d4e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  listAvatarRingNew: { borderColor: C.primary },
  listAvatar: { width: 42, height: 42, borderRadius: 21 },
  listMeta: { flex: 1 },
  listName: { fontSize: 15, fontWeight: '700', color: C.text },
  listTime: { fontSize: 13, color: C.muted, marginTop: 2 },
  listThumbWrap: {
    width: 48,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  listThumb: { width: '100%', height: '100%' },
  listThumbPlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  emptySub: { fontSize: 14, color: C.muted },

  fab: {
    position: 'absolute',
    right: 20,
    borderRadius: 28,
    zIndex: 100,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  fabGrad: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addMenuRoot: { flex: 1, justifyContent: 'flex-end' },
  addMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  addMenuSheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  addMenuHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 12,
  },
  addMenuTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  addMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 14,
  },
  addMenuIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMenuText: { flex: 1 },
  addMenuLabel: { fontSize: 16, fontWeight: '700', color: C.text },
  addMenuSub: { fontSize: 13, color: C.muted, marginTop: 2 },
});
