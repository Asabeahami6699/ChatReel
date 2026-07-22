import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Hls from 'hls.js/dist/hls.js';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { isHlsUrl } from '../../lib/reelPlayback';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  muted: boolean;
  volume?: number;
  shouldPlay: boolean;
  contentFit?: 'contain' | 'cover' | 'fill';
  onReady?: () => void;
  onPlaybackStatusUpdate?: (status: ReelPlaybackStatus) => void;
};

function videoCss(contentFit: 'contain' | 'cover' | 'fill'): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    display: 'block',
    backgroundColor: '#000',
    objectFit: contentFit,
    objectPosition: 'center',
  };
}

function isBenignPlayError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === 'AbortError' || err.name === 'NotAllowedError';
}

function bufferedEndMillis(video: HTMLVideoElement): number {
  const ranges = video.buffered;
  if (!ranges.length) return 0;
  return Math.round(ranges.end(ranges.length - 1) * 1000);
}

/** Web player: no native loop — parent shows end screen then calls replayAsync(). */
export const WebHlsVideo = forwardRef<ReelPlayerHandle, Props>(function WebHlsVideo(
  {
    uri,
    style,
    muted,
    volume,
    shouldPlay,
    contentFit = 'contain',
    onReady,
    onPlaybackStatusUpdate,
  },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<InstanceType<typeof Hls> | null>(null);
  const onReadyRef = useRef(onReady);
  const onStatusRef = useRef(onPlaybackStatusUpdate);
  const shouldPlayRef = useRef(shouldPlay);
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const playGenRef = useRef(0);
  const mountedRef = useRef(true);

  onReadyRef.current = onReady;
  onStatusRef.current = onPlaybackStatusUpdate;
  shouldPlayRef.current = shouldPlay;
  mutedRef.current = muted;
  volumeRef.current = volume;

  const lastStatusEmitRef = useRef(0);
  const STATUS_EMIT_MS = 250;

  const emitStatus = (video: HTMLVideoElement, extra?: Partial<ReelPlaybackStatus>) => {
    const durationSec = video.duration;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;
    onStatusRef.current?.({
      isLoaded: true,
      isPlaying: !video.paused && !video.ended,
      positionMillis: Math.round(video.currentTime * 1000),
      durationMillis: Math.round(durationSec * 1000),
      bufferedMillis: bufferedEndMillis(video),
      ...extra,
    });
  };

  const emitStatusThrottled = (video: HTMLVideoElement, force = false) => {
    if (force) {
      lastStatusEmitRef.current = Date.now();
      emitStatus(video);
      return;
    }
    const now = Date.now();
    if (now - lastStatusEmitRef.current < STATUS_EMIT_MS) return;
    lastStatusEmitRef.current = now;
    emitStatus(video);
  };

  const applyPlayback = (video: HTMLVideoElement) => {
    video.muted = mutedRef.current;
    if (volumeRef.current !== undefined) video.volume = volumeRef.current;
    if (!shouldPlayRef.current) {
      video.pause();
      emitStatusThrottled(video, true);
      return;
    }
    if (video.ended) return;
    const gen = ++playGenRef.current;
    const result = video.play();
    if (result !== undefined) {
      void result.catch((err: unknown) => {
        if (gen !== playGenRef.current) return;
        if (!isBenignPlayError(err)) {
          /* ignore autoplay / abort errors */
        }
      });
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      playAsync: async () => {
        const video = videoRef.current;
        if (!video) return;
        shouldPlayRef.current = true;
        applyPlayback(video);
      },
      pauseAsync: async () => {
        const video = videoRef.current;
        if (!video) return;
        shouldPlayRef.current = false;
        video.pause();
        emitStatusThrottled(video, true);
      },
      replayAsync: async () => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = 0;
        shouldPlayRef.current = true;
        applyPlayback(video);
      },
      setPositionAsync: async (millis: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = millis / 1000;
        emitStatus(video);
      },
      setIsMutedAsync: async (muted: boolean) => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = muted;
      },
      getStatusAsync: async () => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
          return { isLoaded: false };
        }
        return {
          isLoaded: true,
          isPlaying: !video.paused && !video.ended,
          positionMillis: Math.round(video.currentTime * 1000),
          durationMillis: Math.round(video.duration * 1000),
          bufferedMillis: bufferedEndMillis(video),
        };
      },
    }),
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    const video = videoRef.current;
    if (!video) return;

    playGenRef.current += 1;
    video.pause();

    const signalReady = () => {
      if (!mountedRef.current) return;
      onReadyRef.current?.();
      emitStatus(video);
      applyPlayback(video);
    };

    const onTimeUpdate = () => emitStatusThrottled(video);
    const onProgress = () => emitStatusThrottled(video);
    const onEnded = () => {
      video.pause();
      emitStatus(video, { didJustFinish: true });
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('progress', onProgress);
    video.addEventListener('ended', onEnded);

    const destroyHls = () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };

    const isBlob = uri.startsWith('blob:');
    const useHls = !isBlob && isHlsUrl(uri);

    if (isBlob || !useHls) {
      video.preload = 'auto';
      video.src = uri;
      video.addEventListener('loadeddata', signalReady, { once: true });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.preload = 'auto';
      video.src = uri;
      video.addEventListener('loadeddata', signalReady, { once: true });
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: 0,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
      });
      hlsRef.current = hls;
      hls.loadSource(uri);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, signalReady);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        }
      });
    } else {
      video.src = uri;
      video.addEventListener('loadeddata', signalReady, { once: true });
    }

    return () => {
      mountedRef.current = false;
      playGenRef.current += 1;
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('ended', onEnded);
      video.pause();
      video.removeAttribute('src');
      video.load();
      destroyHls();
    };
  }, [uri]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    applyPlayback(video);
  }, [muted, shouldPlay, volume]);

  return (
    <View style={style}>
      <video ref={videoRef} style={videoCss(contentFit)} playsInline muted={muted} preload="auto" />
    </View>
  );
});
