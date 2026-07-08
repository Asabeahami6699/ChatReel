import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReelSoundPicker, soundLabel } from './ReelSoundPicker';
import { ReelSoundTrimTimeline } from './ReelSoundTrimTimeline';
import { defaultSoundRange, IMAGE_SOUND_CLIP_SEC, soundClipWindow, soundTrackDurationSec } from './reelSoundUtils';
import type { ReelSoundDTO } from '../../lib/api';
import type { ReelUploadVisibility } from '../../lib/reelUploadQueue';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../../lib/appAudio';
import {
  getReelFilterOverlay,
  REEL_FILTER_PRESETS,
  type ReelFilterId,
} from './reelFilters';
import { REEL_ACCENT } from './reelTheme';
import { pauseReelFeedPlayback } from '../../lib/reelPlaybackBridge';

/** Photo reels display ~15s in feed — default music clip length. */
export const IMAGE_REEL_CLIP_SEC = IMAGE_SOUND_CLIP_SEC;

type DockTab = 'filter' | 'sound' | 'details';

export type ImageDraft = {
  id: string;
  uri: string;
  fileName?: string;
  mime?: string;
  width?: number;
  height?: number;
  filterId?: ReelFilterId;
};

type Props = {
  image: ImageDraft;
  caption: string;
  visibility: ReelUploadVisibility;
  groupId: string | null;
  groups: Array<{ id: string; name?: string }>;
  selectedSound: ReelSoundDTO | null;
  soundStartSec: number;
  soundEndSec: number;
  isQueuing: boolean;
  onImageChange: (patch: Partial<ImageDraft>) => void;
  onCaptionChange: (v: string) => void;
  onVisibilityChange: (v: ReelUploadVisibility) => void;
  onGroupIdChange: (id: string | null) => void;
  onSoundChange: (sound: ReelSoundDTO | null) => void;
  onSoundStartChange: (sec: number) => void;
  onSoundEndChange: (sec: number) => void;
  onPost: () => void;
  onClose: () => void;
  onReplaceMedia: () => void;
};

export function PostReelImageComposer({
  image,
  caption,
  visibility,
  groupId,
  groups,
  selectedSound,
  soundStartSec,
  soundEndSec,
  isQueuing,
  onImageChange,
  onCaptionChange,
  onVisibilityChange,
  onGroupIdChange,
  onSoundChange,
  onSoundStartChange,
  onSoundEndChange,
  onPost,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [dock, setDock] = useState<DockTab>('filter');
  const [soundOpen, setSoundOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [soundPreviewSec, setSoundPreviewSec] = useState(soundStartSec);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const soundPreviewPlayerRef = useRef<AudioPlayer | null>(null);
  const overlayPlayerRef = useRef<AudioPlayer | null>(null);
  const soundWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlayWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clipLenSec = IMAGE_REEL_CLIP_SEC;
  const soundDuration = selectedSound
    ? soundTrackDurationSec(selectedSound, clipLenSec)
    : clipLenSec;
  const soundClipLen = Math.min(clipLenSec, soundDuration);
  const filterId = image.filterId ?? 'none';
  const filterOverlay = getReelFilterOverlay(filterId);
  const previewHeight = Math.max(220, windowHeight * 0.48);

  const overlaySound = useMemo(
    () =>
      dock !== 'sound' && selectedSound
        ? {
            url: selectedSound.preview_url ?? selectedSound.audio_url,
            startSec: soundStartSec,
            endSec: soundEndSec,
          }
        : null,
    [dock, selectedSound, soundStartSec, soundEndSec]
  );

  const stopSoundWatch = useCallback(() => {
    if (soundWatchRef.current) {
      clearInterval(soundWatchRef.current);
      soundWatchRef.current = null;
    }
  }, []);

  const stopOverlayWatch = useCallback(() => {
    if (overlayWatchRef.current) {
      clearInterval(overlayWatchRef.current);
      overlayWatchRef.current = null;
    }
  }, []);

  const stopOverlaySound = useCallback(async () => {
    stopOverlayWatch();
    await releasePlayer(overlayPlayerRef.current);
    overlayPlayerRef.current = null;
  }, [stopOverlayWatch]);

  const stopSoundPreview = useCallback(async () => {
    stopSoundWatch();
    setSoundPlaying(false);
    if (soundPreviewPlayerRef.current) {
      soundPreviewPlayerRef.current.pause();
    }
  }, [stopSoundWatch]);

  const startOverlaySound = useCallback(async () => {
    await stopOverlaySound();
    if (!overlaySound) return;
    await configurePlaybackAudio();
    const player = createPlaybackPlayer(overlaySound.url);
    overlayPlayerRef.current = player;
    await seekPlaybackPlayer(player, overlaySound.startSec);
    player.play();
    overlayWatchRef.current = setInterval(() => {
      const p = overlayPlayerRef.current;
      if (!p) return;
      const end = overlaySound.endSec ?? overlaySound.startSec + clipLenSec;
      if ((p.currentTime ?? 0) >= end - 0.08) {
        void seekPlaybackPlayer(p, overlaySound.startSec).then(() => p.play());
      }
    }, 120);
  }, [clipLenSec, overlaySound, stopOverlaySound]);

  useEffect(() => {
    if (overlaySound) void startOverlaySound();
    else void stopOverlaySound();
    return () => {
      void stopOverlaySound();
    };
  }, [overlaySound, startOverlaySound, stopOverlaySound]);

  const toggleSoundPreview = useCallback(async () => {
    if (!selectedSound) return;
    if (soundPlaying) {
      await stopSoundPreview();
      return;
    }
    const url = selectedSound.preview_url ?? selectedSound.audio_url;
    await configurePlaybackAudio();
    if (!soundPreviewPlayerRef.current) {
      soundPreviewPlayerRef.current = createPlaybackPlayer(url);
    }
    const start = Math.max(soundStartSec, Math.min(soundPreviewSec, soundEndSec - 0.05));
    await seekPlaybackPlayer(soundPreviewPlayerRef.current, start);
    setSoundPreviewSec(start);
    soundPreviewPlayerRef.current.play();
    setSoundPlaying(true);
    stopSoundWatch();
    soundWatchRef.current = setInterval(() => {
      const p = soundPreviewPlayerRef.current;
      if (!p) return;
      const t = p.currentTime ?? 0;
      setSoundPreviewSec(t);
      if (t >= soundEndSec - 0.08) {
        void stopSoundPreview();
        void seekPlaybackPlayer(p, soundStartSec);
        setSoundPreviewSec(soundStartSec);
      }
    }, 80);
  }, [
    selectedSound,
    soundPlaying,
    soundPreviewSec,
    soundStartSec,
    soundEndSec,
    stopSoundPreview,
    stopSoundWatch,
  ]);

  const openSoundPicker = useCallback(() => {
    pauseReelFeedPlayback();
    void stopSoundPreview();
    setDock('sound');
    setSoundOpen(true);
  }, [stopSoundPreview]);

  const handleSoundSelect = useCallback(
    (sound: ReelSoundDTO | null) => {
      onSoundChange(sound);
      if (!sound) {
        onSoundStartChange(0);
        onSoundEndChange(0);
        return;
      }
      const range = defaultSoundRange(sound, clipLenSec);
      onSoundStartChange(range.start);
      onSoundEndChange(range.end);
      setSoundPreviewSec(range.start);
    },
    [clipLenSec, onSoundChange, onSoundEndChange, onSoundStartChange]
  );

  useEffect(() => {
    pauseReelFeedPlayback();
    return () => {
      stopSoundWatch();
      stopOverlayWatch();
      void releasePlayer(soundPreviewPlayerRef.current);
      void releasePlayer(overlayPlayerRef.current);
      soundPreviewPlayerRef.current = null;
      overlayPlayerRef.current = null;
    };
  }, [stopOverlayWatch, stopSoundWatch]);

  useEffect(() => {
    if (dock !== 'sound') void stopSoundPreview();
  }, [dock, stopSoundPreview]);

  useEffect(() => {
    return () => {
      void releasePlayer(soundPreviewPlayerRef.current);
      soundPreviewPlayerRef.current = null;
    };
  }, [selectedSound?.id]);

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={onClose} disabled={isQueuing} hitSlop={12}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.previewBtn}
            onPress={() => setPreviewOpen(true)}
            disabled={isQueuing}
          >
            <Text style={styles.previewBtnText}>Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.postPill, isQueuing && styles.postPillDisabled]}
            onPress={onPost}
            disabled={isQueuing}
          >
            <Text style={styles.postPillText}>{isQueuing ? 'Posting…' : 'Post'}</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.editorScroll}
        contentContainerStyle={styles.editorScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.previewWrap, { height: previewHeight }]}>
          <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="cover" />
          {filterOverlay ? (
            <View style={[styles.filterOverlay, { backgroundColor: filterOverlay }]} pointerEvents="none" />
          ) : null}
        </View>

        {dock === 'filter' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            style={styles.filterScroll}
          >
            {REEL_FILTER_PRESETS.map((preset) => {
              const active = filterId === preset.id;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => onImageChange({ filterId: preset.id })}
                >
                  <View style={[styles.filterSwatch, active && { borderColor: REEL_ACCENT }]}>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#444' }]} />
                    {preset.overlay ? (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.overlay }]} />
                    ) : null}
                  </View>
                  <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {selectedSound ? (
          <TouchableOpacity style={styles.soundNameRow} onPress={openSoundPicker} activeOpacity={0.85}>
            <Text style={styles.soundNameText} numberOfLines={1}>
              {soundLabel(selectedSound)}
            </Text>
            <TouchableOpacity
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation?.();
                handleSoundSelect(null);
              }}
            >
              <Text style={styles.soundRemoveText}>Remove</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ) : dock === 'sound' ? (
          <TouchableOpacity style={styles.addSoundBtn} onPress={openSoundPicker}>
            <Text style={styles.addSoundText}>Choose a sound</Text>
          </TouchableOpacity>
        ) : null}

        {dock === 'sound' && selectedSound ? (
          <View style={styles.soundTrimPanel}>
            <View style={styles.soundPlayRow}>
              <TouchableOpacity style={styles.soundPlayBtn} onPress={() => void toggleSoundPreview()}>
                <Ionicons name={soundPlaying ? 'pause' : 'play'} size={22} color="#fff" />
                <Text style={styles.soundPlayBtnText}>
                  {soundPlaying ? 'Pause clip' : 'Play clip'}
                </Text>
              </TouchableOpacity>
            </View>
            <ReelSoundTrimTimeline
              duration={soundDuration}
              startSec={soundStartSec}
              endSec={soundEndSec}
              previewSec={Math.max(soundStartSec, Math.min(soundPreviewSec, soundEndSec))}
              onStartChange={(v) => {
                void stopSoundPreview();
                const { start, end } = soundClipWindow(soundDuration, soundClipLen, v);
                onSoundStartChange(start);
                onSoundEndChange(end);
                setSoundPreviewSec(start);
              }}
              onEndChange={(v) => {
                void stopSoundPreview();
                const { start, end } = soundClipWindow(soundDuration, soundClipLen, v - soundClipLen);
                onSoundStartChange(start);
                onSoundEndChange(end);
                if (soundPreviewSec > end) setSoundPreviewSec(end);
                else if (soundPreviewSec < start) setSoundPreviewSec(start);
              }}
              onPreviewChange={(sec) => {
                setSoundPreviewSec(sec);
                if (soundPlaying && soundPreviewPlayerRef.current) {
                  void seekPlaybackPlayer(soundPreviewPlayerRef.current, sec);
                }
              }}
              onPreviewStart={() => void stopSoundPreview()}
            />
            <TouchableOpacity style={styles.changeSoundBtn} onPress={openSoundPicker}>
              <Text style={styles.changeSoundBtnText}>Change sound</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {dock === 'details' ? (
          <View style={styles.detailsPanel}>
            <TextInput
              style={styles.caption}
              placeholder="Caption…"
              placeholderTextColor="#666"
              value={caption}
              onChangeText={onCaptionChange}
              maxLength={2000}
              multiline
              editable={!isQueuing}
            />

            <Text style={styles.sectionLabel}>Audience</Text>
            <View style={styles.visRow}>
              {(
                [
                  { id: 'public', label: 'Public' },
                  { id: 'friends', label: 'Friends' },
                  { id: 'group', label: 'Group' },
                  { id: 'private', label: 'Only me' },
                ] as const
              ).map((opt) => {
                const active = visibility === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.visChip, active && styles.visChipActive]}
                    onPress={() => {
                      onVisibilityChange(opt.id);
                      if (opt.id !== 'group') onGroupIdChange(null);
                    }}
                  >
                    <Text style={[styles.visChipText, active && styles.visChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {visibility === 'group' ? (
              <View style={styles.groupRow}>
                {groups.map((g) => {
                  const active = groupId === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.groupChip, active && styles.groupChipActive]}
                      onPress={() => onGroupIdChange(g.id)}
                    >
                      <Text style={[styles.groupChipText, active && styles.groupChipTextActive]}>
                        {g.name ?? 'Group'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {(
          [
            { id: 'filter' as const, icon: 'color-filter', label: 'Filter' },
            { id: 'sound' as const, icon: 'musical-notes', label: 'Sound' },
            { id: 'details' as const, icon: 'document-text', label: 'Details' },
          ] as const
        ).map((item) => {
          const active = dock === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.dockItem, active && styles.dockItemActive]}
              onPress={() => {
                if (item.id === 'sound') {
                  pauseReelFeedPlayback();
                  void stopSoundPreview();
                }
                setDock(item.id);
                if (item.id === 'sound' && !selectedSound) setSoundOpen(true);
              }}
            >
              <Ionicons name={item.icon as never} size={22} color={active ? REEL_ACCENT : '#aaa'} />
              <Text style={[styles.dockLabel, active && styles.dockLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={previewOpen} animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <View style={[styles.previewModal, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.previewTop}>
            <TouchableOpacity onPress={() => setPreviewOpen(false)}>
              <Text style={styles.previewBack}>Back to edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.postPill, isQueuing && styles.postPillDisabled]}
              onPress={() => {
                setPreviewOpen(false);
                onPost();
              }}
              disabled={isQueuing}
            >
              <Text style={styles.postPillText}>Post</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.previewWrap, { flex: 1 }]}>
            <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="cover" />
            {filterOverlay ? (
              <View style={[styles.filterOverlay, { backgroundColor: filterOverlay }]} pointerEvents="none" />
            ) : null}
          </View>
          {selectedSound ? (
            <Text style={styles.previewSoundHint}>Sound: {soundLabel(selectedSound)}</Text>
          ) : null}
        </View>
      </Modal>

      <ReelSoundPicker
        visible={soundOpen}
        selectedId={selectedSound?.id}
        onClose={() => setSoundOpen(false)}
        onSelect={handleSoundSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  previewBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  postPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: REEL_ACCENT,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
  },
  postPillDisabled: { opacity: 0.5 },
  postPillText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  editorScroll: { flex: 1 },
  editorScrollContent: { paddingBottom: 8 },
  previewWrap: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
  filterOverlay: { ...StyleSheet.absoluteFillObject },
  filterScroll: { marginTop: 10, maxHeight: 88 },
  filterRow: { gap: 10, paddingHorizontal: 16, paddingBottom: 4 },
  filterChip: { alignItems: 'center', width: 64 },
  filterChipActive: {},
  filterSwatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  filterLabel: { color: '#888', fontSize: 11, fontWeight: '600' },
  filterLabelActive: { color: '#fff' },
  soundNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    gap: 10,
  },
  soundNameText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  soundRemoveText: { color: '#ff6b6b', fontSize: 12, fontWeight: '600' },
  addSoundBtn: {
    alignSelf: 'center',
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  addSoundText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  soundTrimPanel: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#111',
    borderRadius: 14,
  },
  soundPlayRow: { marginBottom: 10 },
  soundPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: REEL_ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
  },
  soundPlayBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  changeSoundBtn: { marginTop: 12, alignSelf: 'flex-start' },
  changeSoundBtnText: { color: REEL_ACCENT, fontSize: 13, fontWeight: '600' },
  dock: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#222',
    backgroundColor: '#0a0a0a',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  dockItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  dockItemActive: { backgroundColor: 'rgba(0,122,255,0.08)' },
  dockLabel: { color: '#888', fontSize: 10, fontWeight: '600' },
  dockLabelActive: { color: REEL_ACCENT },
  detailsPanel: {
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  caption: {
    color: '#fff',
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 14,
    minHeight: 88,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  visRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  visChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161616',
  },
  visChipActive: { backgroundColor: '#0e2a44', borderWidth: 1, borderColor: REEL_ACCENT },
  visChipText: { color: '#888', fontSize: 12, fontWeight: '600' },
  visChipTextActive: { color: '#fff' },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  groupChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#161616',
  },
  groupChipActive: { backgroundColor: '#0e2a44' },
  groupChipText: { color: '#888', fontSize: 12, fontWeight: '600' },
  groupChipTextActive: { color: '#fff' },
  previewModal: { flex: 1, backgroundColor: '#000' },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  previewBack: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewSoundHint: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
