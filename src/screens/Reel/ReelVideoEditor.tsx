import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ReelPlayer, type ReelPlaybackStatus, type ReelPlayerHandle } from '../../components/ReelPlayer';
import { Ionicons } from '@expo/vector-icons';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../../lib/appAudio';
import { COMPOSE_PREVIEW_HEIGHT, ComposeVideoPreview } from '../../components/ComposeVideoPreview';
import { fitMediaInBounds } from './reelVideoLayout';
import { ReelTrimTimeline } from './ReelTrimTimeline';
import {
  getReelFilterOverlay,
  REEL_FILTER_PRESETS,
  type ReelFilterId,
} from './reelFilters';

export type ReelVideoEditState = {
  uri: string;
  fileName?: string;
  mime?: string;
  width?: number;
  height?: number;
  duration?: number;
  trimStartSec: number;
  trimEndSec: number;
  filterId?: ReelFilterId;
};

type Props = {
  video: ReelVideoEditState;
  onChange: (patch: Partial<ReelVideoEditState>) => void;
  onEditNative: () => void;
  onPickThumbnailFrame: (timeSec: number) => void;
  overlaySound?: { url: string; startSec: number; endSec?: number } | null;
  immersive?: boolean;
  showTrimControls?: boolean;
  showFilterControls?: boolean;
  /** Full-screen final preview — loops trimmed clip with sound/filter. */
  previewMode?: boolean;
  /** Pause video + overlay (e.g. while editing music on another tab). */
  forcePaused?: boolean;
};

const MIN_TRIM_GAP = 0.5;

function mapSoundOffset(
  overlay: { startSec: number; endSec?: number },
  posSec: number,
  trimStart: number
): number {
  const clipOffset = Math.max(0, posSec - trimStart);
  const segStart = overlay.startSec;
  const segEnd = overlay.endSec;
  if (segEnd != null && segEnd > segStart) {
    const segLen = segEnd - segStart;
    return segStart + (clipOffset % segLen);
  }
  return segStart + clipOffset;
}

export function ReelVideoEditor({
  video,
  onChange,
  onEditNative: _onEditNative,
  onPickThumbnailFrame,
  overlaySound = null,
  immersive = false,
  showTrimControls = true,
  showFilterControls = false,
  previewMode = false,
  forcePaused = false,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const playerRef = useRef<ReelPlayerHandle>(null);
  const soundPlayerRef = useRef<AudioPlayer | null>(null);
  const durationSyncedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [positionSec, setPositionSec] = useState(video.trimStartSec);
  const [loadedDurationSec, setLoadedDurationSec] = useState<number | null>(
    video.duration && video.duration > 0 ? video.duration : null
  );

  const filterId = video.filterId ?? 'none';
  const filterOverlay = getReelFilterOverlay(filterId);

  useEffect(() => {
    durationSyncedRef.current = false;
    setLoadedDurationSec(video.duration && video.duration > 0 ? video.duration : null);
    setPositionSec(0);
  }, [video.uri]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await releasePlayer(soundPlayerRef.current);
      soundPlayerRef.current = null;
      if (!overlaySound?.url) return;
      await configurePlaybackAudio();
      if (!alive) return;
      soundPlayerRef.current = createPlaybackPlayer(overlaySound.url);
    })();
    return () => {
      alive = false;
      void releasePlayer(soundPlayerRef.current);
      soundPlayerRef.current = null;
    };
  }, [overlaySound?.url, overlaySound?.startSec, overlaySound?.endSec]);

  const duration = loadedDurationSec ?? 0;
  const trimReady = duration > MIN_TRIM_GAP;
  const trimEnd = trimReady
    ? Math.min(Math.max(video.trimEndSec, MIN_TRIM_GAP), duration)
    : duration;
  const trimStart = trimReady
    ? Math.max(0, Math.min(video.trimStartSec, trimEnd - MIN_TRIM_GAP))
    : 0;

  const syncOverlaySound = useCallback(
    async (playing: boolean, posSec: number) => {
      const sp = soundPlayerRef.current;
      if (!overlaySound || !sp) return;
      const offset = mapSoundOffset(overlaySound, posSec, trimStart);
      if (playing) {
        await seekPlaybackPlayer(sp, offset);
        sp.play();
      } else {
        sp.pause();
      }
    },
    [overlaySound, trimStart]
  );

  useEffect(() => {
    if (!forcePaused) return;
    setIsPlaying(false);
    void playerRef.current?.pauseAsync();
    void syncOverlaySound(false, positionSec);
  }, [forcePaused, positionSec, syncOverlaySound]);

  const seekTo = useCallback(
    async (sec: number) => {
      const clamped = Math.max(trimStart, Math.min(sec, trimEnd));
      setPositionSec(clamped);
      await playerRef.current?.setPositionAsync(clamped * 1000);
      if (isPlaying) await syncOverlaySound(true, clamped);
    },
    [trimStart, trimEnd, isPlaying, syncOverlaySound]
  );

  const togglePlay = useCallback(async () => {
    if (forcePaused) return;
    const ref = playerRef.current;
    if (!ref) return;
    if (isPlaying) {
      await ref.pauseAsync();
      setIsPlaying(false);
      await syncOverlaySound(false, positionSec);
    } else {
      await ref.playAsync();
      setIsPlaying(true);
      await syncOverlaySound(true, positionSec);
    }
  }, [forcePaused, isPlaying, positionSec, syncOverlaySound]);

  const onPlaybackStatus = useCallback(
    (status: ReelPlaybackStatus) => {
      if (!status.isLoaded) return;

      if (
        status.videoWidth &&
        status.videoHeight &&
        status.videoWidth > 0 &&
        status.videoHeight > 0 &&
        (video.width !== status.videoWidth || video.height !== status.videoHeight)
      ) {
        onChange({ width: status.videoWidth, height: status.videoHeight });
      }

      const durSec =
        status.durationMillis && status.durationMillis > 0
          ? status.durationMillis / 1000
          : null;
      if (durSec != null) {
        setLoadedDurationSec(durSec);
        if (!durationSyncedRef.current) {
          durationSyncedRef.current = true;
          const hasTrim = video.trimEndSec > MIN_TRIM_GAP;
          onChange({
            duration: durSec,
            trimStartSec: hasTrim ? video.trimStartSec : 0,
            trimEndSec: hasTrim ? Math.min(video.trimEndSec, durSec) : durSec,
          });
        }
      }

      const pos = (status.positionMillis ?? 0) / 1000;
      setPositionSec(pos);
      if (!trimReady) return;
      if (status.didJustFinish || pos >= trimEnd - 0.05) {
        void seekTo(trimStart).then(() => {
          if (isPlaying) {
            void playerRef.current?.playAsync();
            void syncOverlaySound(true, trimStart);
          }
        });
      }
    },
    [trimStart, trimEnd, trimReady, isPlaying, seekTo, syncOverlaySound, onChange, video.width, video.height, video.trimStartSec, video.trimEndSec]
  );

  const previewMaxWidth = Math.max(280, windowWidth - (immersive || previewMode ? 28 : 32));
  const previewMaxHeight = previewMode
    ? Math.max(320, windowWidth * 1.55)
    : immersive
      ? Math.min(COMPOSE_PREVIEW_HEIGHT, Math.round(previewMaxWidth * 1.55))
      : Math.min(480, Math.round(previewMaxWidth * 1.35));
  const mediaLayout =
    video.width && video.height && video.width > 0 && video.height > 0
      ? fitMediaInBounds(video.width, video.height, previewMaxWidth, previewMaxHeight)
      : { width: previewMaxWidth, height: previewMaxHeight };

  const previewCard = (
    <View
      style={[
        styles.previewWrap,
        (immersive || previewMode) && styles.previewWrapImmersive,
        previewMode && styles.previewWrapFull,
        {
          width: mediaLayout.width,
          height: mediaLayout.height,
        },
      ]}
    >
      <TouchableOpacity activeOpacity={1} onPress={() => void togglePlay()} style={styles.videoTap}>
        <ReelPlayer
          ref={playerRef}
          source={video.uri}
          style={styles.preview}
          contentFit="contain"
          isLooping={false}
          shouldPlay={isPlaying && !forcePaused}
          isMuted={overlaySound ? true : isMuted}
          progressUpdateIntervalMillis={200}
          onPlaybackStatusUpdate={onPlaybackStatus}
        />
        {filterOverlay ? (
          <View style={[styles.filterOverlay, { backgroundColor: filterOverlay }]} pointerEvents="none" />
        ) : null}
        {!isPlaying && (
          <View style={styles.playOverlay}>
            <Ionicons name="play" size={48} color="rgba(255,255,255,0.9)" />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.topTools}>
        <TouchableOpacity style={styles.toolBtn} onPress={() => void togglePlay()}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#fff" />
        </TouchableOpacity>
        {!overlaySound ? (
          <TouchableOpacity style={styles.toolBtn} onPress={() => setIsMuted((m) => !m)}>
            <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={[styles.wrap, (immersive || previewMode) && styles.wrapImmersive, previewMode && styles.wrapPreview]}>
      {previewMode ? (
        <View style={styles.previewModeShell}>
          {previewCard}
          <Text style={styles.previewHintOverlay}>
            Previewing your trimmed clip — tap video to play or pause
          </Text>
        </View>
      ) : immersive ? (
        <ComposeVideoPreview
          height={mediaLayout.height}
          width={mediaLayout.width}
          style={styles.composeCard}
        >
          {previewCard}
        </ComposeVideoPreview>
      ) : (
        previewCard
      )}

      {!immersive ? <Text style={styles.hint}>Tap video to play or pause</Text> : null}

      {showFilterControls ? (
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
                onPress={() => onChange({ filterId: preset.id })}
              >
                <View
                  style={[
                    styles.filterSwatch,
                    active && { borderColor: '#1e90ff' },
                  ]}
                >
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#444' }]} />
                  {preset.overlay ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.overlay }]} />
                  ) : null}
                </View>
                <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{preset.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {!trimReady ? (
        !immersive && !previewMode ? <Text style={styles.loadingHint}>Loading video duration…</Text> : null
      ) : showTrimControls && !previewMode ? (
        <ReelTrimTimeline
          duration={duration}
          trimStart={trimStart}
          trimEnd={trimEnd}
          position={positionSec}
          onTrimStartChange={(v) => onChange({ trimStartSec: v })}
          onTrimEndChange={(v) => onChange({ trimEndSec: v })}
          onTrimStartComplete={(v) => void seekTo(v)}
          onScrubStart={() => void playerRef.current?.pauseAsync().then(() => setIsPlaying(false))}
          onScrubMove={(v) => {
            setPositionSec(v);
            void playerRef.current?.setPositionAsync(v * 1000);
          }}
          onScrubComplete={(v) => void seekTo(v)}
        />
      ) : null}

      {!previewMode && !immersive ? (
        <TouchableOpacity style={styles.thumbFrameBtn} onPress={() => onPickThumbnailFrame(positionSec)}>
          <Text style={styles.thumbFrameBtnText}>Use current frame as cover</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  wrapImmersive: { marginBottom: 0 },
  wrapPreview: { flex: 1, marginBottom: 0 },
  composeCard: { marginHorizontal: 14 },
  previewWrap: {
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    flex: 1,
  },
  previewWrapImmersive: {
    borderRadius: 0,
    alignSelf: 'stretch',
    marginHorizontal: 0,
    borderWidth: 0,
  },
  previewWrapFull: {
    flex: 1,
    minHeight: 280,
  },
  previewModeShell: {
    flex: 1,
    width: '100%',
  },
  videoTap: { width: '100%', height: '100%' },
  preview: { width: '100%', height: '100%' },
  filterOverlay: { ...StyleSheet.absoluteFillObject },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topTools: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  toolBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  hint: { color: '#888', fontSize: 12, marginTop: 8, marginBottom: 4 },
  loadingHint: { color: '#9eb4c7', fontSize: 12, marginTop: 10, marginBottom: 4 },
  filterScroll: { marginTop: 10, maxHeight: 88 },
  filterRow: { gap: 10, paddingHorizontal: 4, paddingBottom: 4 },
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
  previewHint: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  previewHintOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbFrameBtn: { marginTop: 12, alignSelf: 'flex-start' },
  thumbFrameBtnText: { color: '#1e90ff', fontSize: 13, fontWeight: '600' },
});
