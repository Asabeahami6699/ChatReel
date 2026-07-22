import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';

export type ReelPlaybackStatus = {
  isLoaded: boolean;
  isPlaying?: boolean;
  positionMillis?: number;
  durationMillis?: number;
  /** How far ahead of the playhead is buffered (TikTok-style progress). */
  bufferedMillis?: number;
  didJustFinish?: boolean;
  videoWidth?: number;
  videoHeight?: number;
};

export type ReelPlayerHandle = {
  playAsync: () => Promise<void>;
  pauseAsync: () => Promise<void>;
  replayAsync: () => Promise<void>;
  setPositionAsync: (millis: number) => Promise<void>;
  setIsMutedAsync: (muted: boolean) => Promise<void>;
  getStatusAsync: () => Promise<ReelPlaybackStatus>;
};

type Props = {
  source: string;
  style?: StyleProp<ViewStyle>;
  shouldPlay?: boolean;
  isMuted?: boolean;
  volume?: number;
  isLooping?: boolean;
  contentFit?: 'contain' | 'cover' | 'fill';
  /** Show OS playback controls (preview / chat). */
  nativeControls?: boolean;
  progressUpdateIntervalMillis?: number;
  onReadyForDisplay?: () => void;
  onPlaybackStatusUpdate?: (status: ReelPlaybackStatus) => void;
};

export const ReelPlayer = forwardRef<ReelPlayerHandle, Props>(function ReelPlayer(
  {
    source,
    style,
    shouldPlay = false,
    isMuted = false,
    volume,
    isLooping = true,
    contentFit = 'contain',
    nativeControls = false,
    progressUpdateIntervalMillis = 250,
    onReadyForDisplay,
    onPlaybackStatusUpdate,
  },
  ref
) {
  const readyRef = useRef(false);
  const onStatusRef = useRef(onPlaybackStatusUpdate);
  const onReadyRef = useRef(onReadyForDisplay);
  onStatusRef.current = onPlaybackStatusUpdate;
  onReadyRef.current = onReadyForDisplay;

  const player = useVideoPlayer(source, (p) => {
    p.loop = isLooping;
    p.muted = isMuted;
    if (volume !== undefined) p.volume = volume;
    p.timeUpdateEventInterval = progressUpdateIntervalMillis / 1000;
  });

  useImperativeHandle(
    ref,
    () => ({
      playAsync: async () => {
        player.play();
      },
      pauseAsync: async () => {
        player.pause();
      },
      replayAsync: async () => {
        player.currentTime = 0;
        player.play();
      },
      setPositionAsync: async (millis: number) => {
        player.currentTime = millis / 1000;
      },
      setIsMutedAsync: async (muted: boolean) => {
        player.muted = muted;
      },
      getStatusAsync: async () => ({
        isLoaded: player.duration > 0 || readyRef.current,
        isPlaying: player.playing,
        positionMillis: Math.round(player.currentTime * 1000),
        durationMillis: Math.round(player.duration * 1000),
      }),
    }),
    [player]
  );

  useEffect(() => {
    player.loop = isLooping;
  }, [isLooping, player]);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (volume !== undefined) player.volume = volume;
  }, [volume, player]);

  useEffect(() => {
    player.timeUpdateEventInterval = progressUpdateIntervalMillis / 1000;
  }, [player, progressUpdateIntervalMillis]);

  useEffect(() => {
    if (nativeControls) return;
    if (shouldPlay) player.play();
    else player.pause();
  }, [player, shouldPlay, nativeControls]);

  useEffect(() => {
    const emitStatus = (extra?: Partial<ReelPlaybackStatus>) => {
      if (!onStatusRef.current) return;
      onStatusRef.current({
        isLoaded: player.duration > 0 || readyRef.current,
        isPlaying: player.playing,
        positionMillis: Math.round(player.currentTime * 1000),
        durationMillis: Math.round(player.duration * 1000),
        ...extra,
      });
    };

    const statusSub = player.addListener('statusChange', (event) => {
      if (event.status === 'readyToPlay' && !readyRef.current) {
        readyRef.current = true;
        onReadyRef.current?.();
      }
      emitStatus();
    });

    const timeSub = player.addListener('timeUpdate', () => emitStatus());
    const playSub = player.addListener('playingChange', () => emitStatus());
    const endSub = player.addListener('playToEnd', () => emitStatus({ didJustFinish: true }));

    const sourceSub = player.addListener('sourceLoad', (payload) => {
      if (!readyRef.current) {
        readyRef.current = true;
        onReadyRef.current?.();
      }
      const track = payload.availableVideoTracks?.[0];
      emitStatus({
        videoWidth: track?.size?.width,
        videoHeight: track?.size?.height,
        durationMillis:
          payload.duration > 0
            ? Math.round(payload.duration * 1000)
            : Math.round(player.duration * 1000),
      });
    });

    return () => {
      statusSub.remove();
      timeSub.remove();
      playSub.remove();
      endSub.remove();
      sourceSub.remove();
    };
  }, [player]);

  return (
    <View pointerEvents="none" style={style ? [styles.fill, style] : styles.fill}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit={contentFit}
        nativeControls={nativeControls}
        playsInline
        pointerEvents={nativeControls ? 'auto' : 'none'}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden' },
  /** Prefer % sizing over absoluteFill so web object-fit:contain letterboxes correctly. */
  video: { width: '100%', height: '100%' },
});

export type { VideoPlayer as ReelVideoPlayer };
