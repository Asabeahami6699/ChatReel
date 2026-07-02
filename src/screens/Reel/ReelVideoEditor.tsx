import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ReelPlayer, type ReelPlaybackStatus, type ReelPlayerHandle } from '../../components/ReelPlayer';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { fitMediaInBounds } from './reelVideoLayout';

export type ReelVideoEditState = {
  uri: string;
  fileName?: string;
  mime?: string;
  width?: number;
  height?: number;
  duration?: number;
  trimStartSec: number;
  trimEndSec: number;
};

type Props = {
  video: ReelVideoEditState;
  onChange: (patch: Partial<ReelVideoEditState>) => void;
  onEditNative: () => void;
  onPickThumbnailFrame: (timeSec: number) => void;
};

const MIN_TRIM_GAP = 0.5;

/** Slider requires strictly min < max. */
function sliderRange(min: number, max: number, minGap = 0.01): { min: number; max: number } {
  if (max > min) return { min, max };
  return { min, max: min + minGap };
}

export function ReelVideoEditor({
  video,
  onChange,
  onEditNative,
  onPickThumbnailFrame,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const playerRef = useRef<ReelPlayerHandle>(null);
  const durationSyncedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [positionSec, setPositionSec] = useState(video.trimStartSec);
  const [loadedDurationSec, setLoadedDurationSec] = useState<number | null>(
    video.duration && video.duration > 0 ? video.duration : null
  );
  const [displaySize, setDisplaySize] = useState(() => {
    const w = video.width && video.height ? video.width : 9;
    const h = video.width && video.height ? video.height : 16;
    return fitMediaInBounds(w, h, Math.max(280, windowWidth - 32), 480);
  });

  useEffect(() => {
    const w = video.width && video.height ? video.width : 9;
    const h = video.width && video.height ? video.height : 16;
    setDisplaySize(fitMediaInBounds(w, h, Math.max(280, windowWidth - 32), 480));
  }, [video.width, video.height, windowWidth]);

  useEffect(() => {
    durationSyncedRef.current = false;
    setLoadedDurationSec(video.duration && video.duration > 0 ? video.duration : null);
    setPositionSec(video.trimStartSec);
  }, [video.uri, video.duration, video.trimStartSec]);

  const duration = loadedDurationSec ?? 0;
  const trimReady = duration > MIN_TRIM_GAP;
  const trimEnd = trimReady
    ? Math.min(Math.max(video.trimEndSec, MIN_TRIM_GAP), duration)
    : duration;
  const trimStart = trimReady
    ? Math.max(0, Math.min(video.trimStartSec, trimEnd - MIN_TRIM_GAP))
    : 0;

  const scrubRange = sliderRange(trimStart, trimEnd);
  const trimStartRange = sliderRange(0, Math.max(MIN_TRIM_GAP, trimEnd - MIN_TRIM_GAP));
  const trimEndRange = sliderRange(
    Math.min(trimStart + MIN_TRIM_GAP, duration - 0.01),
    duration
  );

  const seekTo = useCallback(async (sec: number) => {
    const clamped = Math.max(trimStart, Math.min(sec, trimEnd));
    setPositionSec(clamped);
    await playerRef.current?.setPositionAsync(clamped * 1000);
  }, [trimStart, trimEnd]);

  const togglePlay = useCallback(async () => {
    const ref = playerRef.current;
    if (!ref) return;
    if (isPlaying) {
      await ref.pauseAsync();
      setIsPlaying(false);
    } else {
      await ref.playAsync();
      setIsPlaying(true);
    }
  }, [isPlaying]);

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
        setDisplaySize(
          fitMediaInBounds(
            status.videoWidth,
            status.videoHeight,
            Math.max(280, windowWidth - 32),
            480
          )
        );
      }

      const durSec =
        status.durationMillis && status.durationMillis > 0
          ? status.durationMillis / 1000
          : null;
      if (durSec != null) {
        setLoadedDurationSec(durSec);
        if (!durationSyncedRef.current) {
          durationSyncedRef.current = true;
          onChange({
            duration: durSec,
            trimStartSec: 0,
            trimEndSec: durSec,
          });
        }
      }

      const pos = (status.positionMillis ?? 0) / 1000;
      setPositionSec(pos);
      if (!trimReady) return;
      if (status.didJustFinish || pos >= trimEnd - 0.05) {
        void seekTo(trimStart).then(() => {
          if (isPlaying) void playerRef.current?.playAsync();
        });
      }
    },
    [trimStart, trimEnd, trimReady, isPlaying, seekTo, onChange, video.width, video.height, windowWidth]
  );

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.previewWrap,
          { width: displaySize.width, height: displaySize.height, alignSelf: 'center' },
        ]}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => void togglePlay()} style={styles.videoTap}>
          <ReelPlayer
            ref={playerRef}
            source={video.uri}
            style={styles.preview}
            contentFit="contain"
            isLooping={false}
            shouldPlay={isPlaying}
            isMuted={isMuted}
            progressUpdateIntervalMillis={200}
            onPlaybackStatusUpdate={onPlaybackStatus}
          />
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
          <TouchableOpacity style={styles.toolBtn} onPress={() => setIsMuted((m) => !m)}>
            <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
          </TouchableOpacity>
          {Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.toolBtn} onPress={onEditNative}>
              <Ionicons name="crop" size={18} color="#fff" />
              <Text style={styles.toolBtnText}>Crop</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={styles.hint}>Tap video to play or pause</Text>

      {!trimReady ? (
        <Text style={styles.loadingHint}>Loading video duration…</Text>
      ) : (
        <>
      <View style={styles.sliderBlock}>
        <Text style={styles.sliderLabel}>
          Scrub · {formatTime(positionSec)} / {formatTime(duration)}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={scrubRange.min}
          maximumValue={scrubRange.max}
          value={Math.max(scrubRange.min, Math.min(positionSec, scrubRange.max))}
          onSlidingStart={() => void playerRef.current?.pauseAsync().then(() => setIsPlaying(false))}
          onSlidingComplete={(v) => void seekTo(v)}
          minimumTrackTintColor="#1e90ff"
          maximumTrackTintColor="#444"
          thumbTintColor="#fff"
        />
      </View>

      <View style={styles.sliderBlock}>
        <Text style={styles.sliderLabel}>
          Trim start · {formatTime(trimStart)}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={trimStartRange.min}
          maximumValue={trimStartRange.max}
          value={Math.max(trimStartRange.min, Math.min(trimStart, trimStartRange.max))}
          onValueChange={(v) => {
            onChange({ trimStartSec: v });
            void seekTo(v);
          }}
          minimumTrackTintColor="#4caf50"
          maximumTrackTintColor="#444"
          thumbTintColor="#fff"
        />
      </View>

      <View style={styles.sliderBlock}>
        <Text style={styles.sliderLabel}>
          Trim end · {formatTime(trimEnd)}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={trimEndRange.min}
          maximumValue={trimEndRange.max}
          value={Math.max(trimEndRange.min, Math.min(trimEnd, trimEndRange.max))}
          onValueChange={(v) => onChange({ trimEndSec: v })}
          minimumTrackTintColor="#ff9800"
          maximumTrackTintColor="#444"
          thumbTintColor="#fff"
        />
      </View>
        </>
      )}

      <TouchableOpacity
        style={styles.thumbFrameBtn}
        onPress={() => onPickThumbnailFrame(positionSec)}
      >
        <Ionicons name="image-outline" size={16} color="#1e90ff" />
        <Text style={styles.thumbFrameBtnText}>Use current frame as cover</Text>
      </TouchableOpacity>
    </View>
  );
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  previewWrap: {
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTap: { width: '100%', height: '100%' },
  preview: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
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
  sliderBlock: { marginTop: 10 },
  sliderLabel: { color: '#aaa', fontSize: 12, marginBottom: 2 },
  slider: { width: '100%', height: 36 },
  thumbFrameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  thumbFrameBtnText: { color: '#1e90ff', fontSize: 13, fontWeight: '600' },
});
