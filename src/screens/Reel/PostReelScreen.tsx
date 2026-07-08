import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { isImageMime } from '../../lib/reelPlayback';
import { pauseReelFeedPlayback, consumePendingComposeDraft, consumePendingComposeSound, setReelPlaybackGate } from '../../lib/reelPlaybackBridge';
import { enqueueReelUpload, type ReelUploadDraft, type ReelUploadVisibility } from '../../lib/reelUploadQueue';
import { saveReelComposeDraft } from '../../lib/reelComposeDraftStore';
import { probeVideoDimensions, probeVideoHasAudio } from '../../lib/videoDimensions';
import { uploadReelExtractTemp } from '../../lib/reelUploader';
import type { ReelVideoEditState } from './ReelVideoEditor';
import { ReelPlayer } from '../../components/ReelPlayer';
import { PostReelVideoComposer } from './PostReelVideoComposer';
import { PostReelImageComposer } from './PostReelImageComposer';
import { VideoAudioPrompt, type VideoAudioChoice } from './VideoAudioPrompt';
import type { ReelFilterId } from './reelFilters';
import { api, type ReelSoundDTO } from '../../lib/api';
import { defaultSoundRange, IMAGE_SOUND_CLIP_SEC } from './reelSoundUtils';

function MediaTilePreview({ item }: { item: MediaDraft }) {
  if (item.mediaType === 'image') {
    return (
      <Image source={{ uri: item.uri }} style={styles.mediaTileImage} resizeMode="contain" />
    );
  }
  return (
    <View style={styles.mediaTileImage}>
      <ReelPlayer
        source={item.uri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        shouldPlay
        isLooping
        isMuted
        nativeControls={false}
      />
    </View>
  );
}


type MediaDraft =
  | {
      id: string;
      mediaType: 'image';
      uri: string;
      fileName?: string;
      mime?: string;
      width?: number;
      height?: number;
      filterId?: ReelFilterId;
    }
  | {
      id: string;
      mediaType: 'video';
      uri: string;
      fileName?: string;
      mime?: string;
      width?: number;
      height?: number;
      duration: number;
      trimStartSec: number;
      trimEndSec: number;
      thumbUri?: string | null;
    };

const MAX_DURATION_SECONDS = 60;
const MAX_SELECTION = 10;

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PostReelScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [items, setItems] = useState<MediaDraft[]>([]);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<ReelUploadVisibility>('public');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Array<{ id: string; name?: string }>>([]);
  const [isQueuing, setIsQueuing] = useState(false);
  const [selectedSound, setSelectedSound] = useState<ReelSoundDTO | null>(null);
  const [soundStartSec, setSoundStartSec] = useState(0);
  const [soundEndSec, setSoundEndSec] = useState(0);
  const [originalAudioVolume, setOriginalAudioVolume] = useState(1);
  const [soundVolume, setSoundVolume] = useState(0.45);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d;
  });
  const [audioPromptVisible, setAudioPromptVisible] = useState(false);
  const [audioPromptBusy, setAudioPromptBusy] = useState(false);
  const [openSoundOnMount, setOpenSoundOnMount] = useState(false);

  useFocusEffect(
    useCallback(() => {
      pauseReelFeedPlayback();
      setReelPlaybackGate('post-reel', true);
      const saved = consumePendingComposeDraft();
      const pendingSound = consumePendingComposeSound();
      if (saved) {
        const { draft, sound } = saved;
        setCaption(draft.caption ?? '');
        setVisibility(draft.visibility);
        setGroupId(draft.group_id ?? null);
        setThumbUri(draft.thumbUri ?? null);
        setSelectedSound(sound ?? null);
        setSoundStartSec(draft.sound_start_sec ?? 0);
        setOriginalAudioVolume(draft.original_audio_volume ?? 1);
        setSoundVolume(draft.sound_volume ?? 0.45);
        if (draft.scheduled_publish_at) {
          setScheduleEnabled(true);
          setScheduleDate(new Date(draft.scheduled_publish_at));
        }
        const media = draft.items?.[0] ?? draft.video;
        if (media?.uri) {
          if (media.mediaType === 'image' || isImageMime(media.mime)) {
            setItems([
              {
                id: newId(),
                mediaType: 'image',
                uri: media.uri,
                fileName: media.fileName,
                mime: media.mime,
                width: media.width,
                height: media.height,
              },
            ]);
          } else {
            const dur = media.duration && media.duration > 0 ? media.duration : MAX_DURATION_SECONDS;
            setItems([
              {
                id: newId(),
                mediaType: 'video',
                uri: media.uri,
                fileName: media.fileName,
                mime: media.mime,
                width: media.width,
                height: media.height,
                duration: dur,
                trimStartSec: media.trimStartSec ?? 0,
                trimEndSec: media.trimEndSec ?? dur,
                thumbUri: draft.thumbUri ?? null,
              },
            ]);
          }
        }
      } else if (pendingSound) {
        setSelectedSound(pendingSound);
        setOriginalAudioVolume(1);
        setSoundVolume(0.45);
        const range = defaultSoundRange(pendingSound, IMAGE_SOUND_CLIP_SEC);
        setSoundStartSec(range.start);
        setSoundEndSec(range.end);
        setOpenSoundOnMount(false);
      }

      return () => {
        setReelPlaybackGate('post-reel', false);
        setReelPlaybackGate('post-reel-nav', false);
      };
    }, [])
  );

  useEffect(() => {
    if (!user?.id) {
      setGroups([]);
      return;
    }
    let alive = true;
    api.groups
      .list()
      .then((res) => {
        if (!alive) return;
        setGroups(
          (res.groups ?? []).map((g) => {
            const row = g as { id: string; name?: string };
            return { id: row.id, name: row.name };
          })
        );
      })
      .catch(() => {
        if (alive) setGroups([]);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const generateThumbnail = useCallback(async (uri: string, timeMs = 500): Promise<string | null> => {
    try {
      const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, {
        time: timeMs,
        quality: 0.75,
      });
      return thumb;
    } catch {
      return null;
    }
  }, []);

  const attachVideoThumb = useCallback(
    async (draft: Extract<MediaDraft, { mediaType: 'video' }>): Promise<MediaDraft> => {
      const thumb = await generateThumbnail(draft.uri);
      return { ...draft, thumbUri: thumb };
    },
    [generateThumbnail]
  );

  const maybePromptVideoAudio = useCallback(async (draft: Extract<MediaDraft, { mediaType: 'video' }>) => {
    const hasAudio = await probeVideoHasAudio(draft.uri);
    if (hasAudio) setAudioPromptVisible(true);
  }, []);

  const handleAudioChoice = useCallback(
    async (choice: VideoAudioChoice) => {
      if (choice === 'keep') {
        setAudioPromptVisible(false);
        return;
      }

      if (choice === 'music') {
        setAudioPromptVisible(false);
        setOriginalAudioVolume(1);
        setSoundVolume(0.45);
        setOpenSoundOnMount(true);
        return;
      }

      const video = items.length === 1 && items[0].mediaType === 'video' ? items[0] : null;
      if (!video) {
        setAudioPromptVisible(false);
        return;
      }

      setAudioPromptBusy(true);
      try {
        const videoUrl = await uploadReelExtractTemp({
          uri: video.uri,
          fileName: video.fileName,
          contentType: video.mime,
        });
        const { sound } = await api.reels.extractSound({
          video_url: videoUrl,
          title: 'Extracted audio',
          duration_sec: video.duration,
        });
        setAudioPromptVisible(false);
        Alert.alert(
          'Audio extracted',
          'Saved to My uploads. Use it as this reel’s music, or keep the video’s original sound?',
          [
            {
              text: 'Use as music',
              onPress: () => {
                setSelectedSound(sound);
                setOriginalAudioVolume(1);
                setSoundVolume(0.45);
                const end = Math.min(sound.duration_sec ?? video.duration, video.duration);
                setSoundStartSec(0);
                setSoundEndSec(end > 0 ? end : video.duration);
              },
            },
            { text: 'Keep video sound', style: 'cancel' },
          ]
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not extract audio';
        Alert.alert('Extract failed', message);
      } finally {
        setAudioPromptBusy(false);
      }
    },
    [items]
  );

  const singleVideo = items.length === 1 && items[0].mediaType === 'video' ? items[0] : null;
  const singleImage = items.length === 1 && items[0].mediaType === 'image' ? items[0] : null;

  const assetToDraft = useCallback(async (asset: ImagePicker.ImagePickerAsset): Promise<MediaDraft | null> => {
    const isImage = asset.type === 'image' || isImageMime(asset.mimeType);
    if (isImage) {
      return {
        id: newId(),
        mediaType: 'image',
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mime: asset.mimeType ?? undefined,
        width: asset.width,
        height: asset.height,
      };
    }

    const durationSec = asset.duration ? asset.duration / 1000 : undefined;
    if (durationSec && durationSec > MAX_DURATION_SECONDS + 1) {
      Alert.alert(
        'Too long',
        `Videos must be ${MAX_DURATION_SECONDS}s or less. Skipped one file.`
      );
      return null;
    }

    let width = asset.width;
    let height = asset.height;
    let duration = durationSec;
    if (!width || !height || !duration) {
      const probed = await probeVideoDimensions(asset.uri);
      width = probed?.width ?? width;
      height = probed?.height ?? height;
      duration = duration ?? probed?.duration;
    }
    const dur = duration && duration > 0 ? duration : MAX_DURATION_SECONDS;
    const videoDraft: Extract<MediaDraft, { mediaType: 'video' }> = {
      id: newId(),
      mediaType: 'video',
      uri: asset.uri,
      fileName: asset.fileName ?? undefined,
      mime: asset.mimeType ?? undefined,
      width,
      height,
      duration: dur,
      trimStartSec: 0,
      trimEndSec: dur,
    };
    return attachVideoThumb(videoDraft);
  }, [attachVideoThumb]);

  const pickMedia = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to your gallery to pick photos or videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: MAX_SELECTION,
      videoMaxDuration: MAX_DURATION_SECONDS,
    });
    if (result.canceled || !result.assets?.length) return;

    const drafts: MediaDraft[] = [];
    for (const asset of result.assets) {
      const draft = await assetToDraft(asset);
      if (draft) drafts.push(draft);
    }
    if (!drafts.length) return;

    setItems((prev) => [...prev, ...drafts].slice(0, MAX_SELECTION));
    const firstVideo = drafts.find((d) => d.mediaType === 'video');
    if (firstVideo?.mediaType === 'video') {
      setThumbUri(firstVideo.thumbUri ?? null);
    }
    if (drafts.length === 1 && drafts[0].mediaType === 'video') {
      void maybePromptVideoAudio(drafts[0]);
    }
  }, [assetToDraft, maybePromptVideoAudio]);

  const recordVideo = useCallback(async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert('Permission needed', 'Allow camera access to record a reel.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'] as ImagePicker.MediaType[],
      videoMaxDuration: MAX_DURATION_SECONDS,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const draft = await assetToDraft(result.assets[0]);
    if (draft) {
      setItems([draft]);
      if (draft.mediaType === 'video') {
        setThumbUri(draft.thumbUri ?? null);
        void maybePromptVideoAudio(draft);
      }
    }
  }, [assetToDraft, maybePromptVideoAudio]);

  const handleVideoChange = useCallback((patch: Partial<ReelVideoEditState>) => {
    setItems((prev) => {
      if (prev.length !== 1 || prev[0].mediaType !== 'video') return prev;
      return [{ ...prev[0], ...patch }];
    });
  }, []);

  const handleImageChange = useCallback((patch: Partial<Extract<MediaDraft, { mediaType: 'image' }>>) => {
    setItems((prev) => {
      if (prev.length !== 1 || prev[0].mediaType !== 'image') return prev;
      return [{ ...prev[0], ...patch }];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setThumbUri(null);
    setCaption('');
    setVisibility('public');
    setGroupId(null);
    setSelectedSound(null);
    setSoundStartSec(0);
    setSoundEndSec(0);
    setOriginalAudioVolume(1);
    setSoundVolume(0.45);
    setScheduleEnabled(false);
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    setScheduleDate(d);
    setAudioPromptVisible(false);
    setAudioPromptBusy(false);
    setOpenSoundOnMount(false);
  }, []);

  const buildUploadDraft = useCallback((): ReelUploadDraft | null => {
    if (!items.length) return null;
    let scheduled_publish_at: string | undefined;
    if (scheduleEnabled) {
      if (scheduleDate.getTime() > Date.now()) {
        scheduled_publish_at = scheduleDate.toISOString();
      }
    }
    return {
      items: items.map((item) => ({
        uri: item.uri,
        fileName: item.fileName,
        mime: item.mime,
        mediaType: item.mediaType,
        width: item.width,
        height: item.height,
        duration: item.mediaType === 'video' ? item.duration : undefined,
        trimStartSec: item.mediaType === 'video' ? item.trimStartSec : undefined,
        trimEndSec: item.mediaType === 'video' ? item.trimEndSec : undefined,
        thumbUri:
          item.mediaType === 'video' ? item.thumbUri ?? thumbUri : item.uri,
      })),
      thumbUri,
      caption,
      visibility,
      group_id: visibility === 'group' && groupId ? groupId : undefined,
      ...(selectedSound
        ? {
            sound_id: selectedSound.id,
            sound_start_sec: soundStartSec,
            original_audio_volume: originalAudioVolume,
            sound_volume: soundVolume,
          }
        : {}),
      ...(scheduled_publish_at ? { scheduled_publish_at } : {}),
    };
  }, [
    items,
    thumbUri,
    caption,
    visibility,
    groupId,
    selectedSound,
    soundStartSec,
    originalAudioVolume,
    soundVolume,
    scheduleEnabled,
    scheduleDate,
  ]);

  const saveDraft = useCallback(async () => {
    const draft = buildUploadDraft();
    if (!draft) return;
    try {
      await saveReelComposeDraft(draft, caption, selectedSound);
      Alert.alert('Draft saved', 'Open it later from your profile menu.');
    } catch (err) {
      Alert.alert('Could not save draft', err instanceof Error ? err.message : 'Try again');
    }
  }, [buildUploadDraft, caption, selectedSound]);

  const upload = useCallback(async () => {
    if (!items.length) return;
    if (visibility === 'group' && !groupId) {
      Alert.alert('Choose a group', 'Select which group can see this reel.');
      return;
    }
    if (scheduleEnabled) {
      if (scheduleDate.getTime() <= Date.now()) {
        Alert.alert('Invalid schedule', 'Pick a future date and time.');
        return;
      }
    }
    const draft = buildUploadDraft();
    if (!draft) return;
    setIsQueuing(true);
    try {
      await enqueueReelUpload(draft);
      reset();
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not queue upload';
      Alert.alert('Upload failed', message);
    } finally {
      setIsQueuing(false);
    }
  }, [items.length, visibility, groupId, scheduleEnabled, scheduleDate, buildUploadDraft, reset, navigation]);

  if (singleImage) {
    return (
      <PostReelImageComposer
        image={singleImage}
        caption={caption}
        visibility={visibility}
        groupId={groupId}
        groups={groups}
        selectedSound={selectedSound}
        soundStartSec={soundStartSec}
        soundEndSec={soundEndSec}
        isQueuing={isQueuing}
        onImageChange={handleImageChange}
        onCaptionChange={setCaption}
        onVisibilityChange={setVisibility}
        onGroupIdChange={setGroupId}
        onSoundChange={setSelectedSound}
        onSoundStartChange={setSoundStartSec}
        onSoundEndChange={setSoundEndSec}
        onPost={() => void upload()}
        onClose={() => navigation.goBack()}
        onReplaceMedia={() => void pickMedia()}
      />
    );
  }

  if (singleVideo) {
    return (
      <>
        <PostReelVideoComposer
          video={singleVideo}
          thumbUri={thumbUri}
          caption={caption}
          visibility={visibility}
          groupId={groupId}
          groups={groups}
          selectedSound={selectedSound}
          soundStartSec={soundStartSec}
          soundEndSec={soundEndSec}
          originalAudioVolume={originalAudioVolume}
          soundVolume={soundVolume}
          scheduleEnabled={scheduleEnabled}
          scheduleDate={scheduleDate}
          isQueuing={isQueuing}
          openSoundOnMount={openSoundOnMount}
          onSoundPickerOpened={() => setOpenSoundOnMount(false)}
          onVideoChange={handleVideoChange}
          onThumbChange={setThumbUri}
          onCaptionChange={setCaption}
          onVisibilityChange={setVisibility}
          onGroupIdChange={setGroupId}
          onSoundChange={(sound) => {
            setSelectedSound(sound);
            if (sound) {
              setOriginalAudioVolume((v) => (v <= 0 ? 1 : v));
              setSoundVolume((v) => (v >= 1 ? 0.45 : v));
            }
          }}
          onSoundStartChange={setSoundStartSec}
          onSoundEndChange={setSoundEndSec}
          onOriginalAudioVolumeChange={setOriginalAudioVolume}
          onSoundVolumeChange={setSoundVolume}
          onScheduleEnabledChange={setScheduleEnabled}
          onScheduleDateChange={setScheduleDate}
          onPost={() => void upload()}
          onSaveDraft={() => void saveDraft()}
          onClose={() => navigation.goBack()}
          onReplaceMedia={() => void pickMedia()}
        />
        <VideoAudioPrompt
          visible={audioPromptVisible}
          busy={audioPromptBusy}
          onChoose={(choice) => void handleAudioChoice(choice)}
          onDismiss={() => setAudioPromptVisible(false)}
        />
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} disabled={isQueuing}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New reel</Text>
        <TouchableOpacity onPress={upload} disabled={!items.length || isQueuing}>
          <Text style={[styles.postButton, (!items.length || isQueuing) && styles.postButtonDisabled]}>
            {isQueuing ? '...' : items.length > 1 ? 'Post album' : 'Post'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {!items.length ? (
          <View style={styles.pickerArea}>
            <Ionicons name="images-outline" size={64} color="#666" />
            <Text style={styles.pickerHint}>
              Pick photos or videos (up to {MAX_SELECTION} at once). Videos max {MAX_DURATION_SECONDS}s.
            </Text>
            <View style={styles.pickerButtons}>
              <TouchableOpacity style={styles.pickerButton} onPress={() => void pickMedia()}>
                <Ionicons name="images" size={20} color="#fff" />
                <Text style={styles.pickerButtonText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerButton} onPress={() => void recordVideo()}>
                <Ionicons name="videocam" size={20} color="#fff" />
                <Text style={styles.pickerButtonText}>Record</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.previewArea}>
            {items.length > 1 || items[0].mediaType === 'image' ? (
              <View style={styles.mediaGrid}>
                {items.map((item) => (
                  <View key={item.id} style={styles.mediaTile}>
                    <MediaTilePreview item={item} />
                    <TouchableOpacity
                      style={styles.mediaRemove}
                      onPress={() => removeItem(item.id)}
                      disabled={isQueuing}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.mediaBadge}>
                      <Ionicons
                        name={item.mediaType === 'image' ? 'image' : 'videocam'}
                        size={11}
                        color="#fff"
                      />
                    </View>
                  </View>
                ))}
                {items.length < MAX_SELECTION && (
                  <TouchableOpacity style={styles.addMoreTile} onPress={() => void pickMedia()}>
                    <Ionicons name="add" size={28} color="#888" />
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.changeBtnRow}
              onPress={() => void pickMedia()}
              disabled={isQueuing}
            >
              <Ionicons name="add-circle-outline" size={16} color="#1e90ff" />
              <Text style={styles.changeBtnRowText}>Add more photos or videos</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.caption}
              placeholder="Write a caption…"
              placeholderTextColor="#888"
              value={caption}
              onChangeText={setCaption}
              maxLength={2000}
              multiline
              editable={!isQueuing}
            />

            <Text style={styles.sectionTitle}>Who can see this?</Text>
            <View style={styles.visibilityRow}>
              {(
                [
                  { id: 'public', label: 'Public', icon: 'globe-outline' },
                  { id: 'friends', label: 'Friends', icon: 'people-outline' },
                  { id: 'group', label: 'Group', icon: 'chatbubbles-outline' },
                  { id: 'private', label: 'Only me', icon: 'lock-closed-outline' },
                ] as const
              ).map((opt) => {
                const active = visibility === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.visBtn, active && styles.visBtnActive]}
                    onPress={() => {
                      setVisibility(opt.id);
                      if (opt.id !== 'group') setGroupId(null);
                    }}
                    disabled={isQueuing}
                  >
                    <Ionicons
                      name={opt.icon as never}
                      size={18}
                      color={active ? '#fff' : '#aaa'}
                    />
                    <Text style={[styles.visBtnText, active && styles.visBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {visibility === 'group' ? (
              <View style={styles.groupPicker}>
                {groups.length === 0 ? (
                  <Text style={styles.groupPickerHint}>Join or create a group to post there.</Text>
                ) : (
                  groups.map((g) => {
                    const active = groupId === g.id;
                    return (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.groupChip, active && styles.groupChipActive]}
                        onPress={() => setGroupId(g.id)}
                        disabled={isQueuing}
                      >
                        <Text style={[styles.groupChipText, active && styles.groupChipTextActive]}>
                          {g.name ?? 'Group'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : null}
          </View>
        )}

        {isQueuing ? <Text style={styles.queuingText}>Starting upload...</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  postButton: { color: '#1e90ff', fontSize: 16, fontWeight: '700' },
  postButtonDisabled: { color: '#555' },
  scrollContent: { padding: 16, paddingBottom: 80 },
  pickerArea: {
    minHeight: 360,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 16,
    borderStyle: 'dashed',
    padding: 24,
  },
  pickerHint: { color: '#aaa', marginTop: 12, marginBottom: 24, textAlign: 'center' },
  pickerButtons: { flexDirection: 'row', gap: 12 },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976d2',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    gap: 8,
  },
  pickerButtonText: { color: '#fff', fontWeight: '600' },
  previewArea: {},
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  mediaTile: {
    width: 100,
    height: 130,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  mediaTileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  mediaRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  addMoreTile: {
    width: 100,
    height: 130,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  changeBtnRowText: { color: '#1e90ff', fontSize: 13, fontWeight: '600' },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#161616',
    borderRadius: 12,
  },
  soundRowText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  thumbPreview: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  thumbTextHint: { color: '#9eb4c7', fontSize: 12 },
  caption: {
    color: '#fff',
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  sectionTitle: { color: '#aaa', marginTop: 18, marginBottom: 8, fontSize: 13 },
  visibilityRow: { flexDirection: 'row', gap: 8 },
  visBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  visBtnActive: { borderColor: '#1976d2', backgroundColor: '#0e2a44' },
  visBtnText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  visBtnTextActive: { color: '#fff' },
  groupPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  groupPickerHint: { color: '#888', fontSize: 13 },
  groupChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#333',
  },
  groupChipActive: { borderColor: '#1976d2', backgroundColor: '#0e2a44' },
  groupChipText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  groupChipTextActive: { color: '#fff' },
  queuingText: { color: '#9eb4c7', marginTop: 14, textAlign: 'center', fontSize: 13 },
});
