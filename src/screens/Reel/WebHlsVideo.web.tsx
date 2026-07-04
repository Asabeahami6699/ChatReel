import React, { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Hls from 'hls.js/dist/hls.js';
import type { ReelPlaybackStatus } from '../../components/ReelPlayer';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  muted: boolean;
  volume?: number;
  shouldPlay: boolean;
  onReady?: () => void;
  onPlaybackStatusUpdate?: (status: ReelPlaybackStatus) => void;
};

const VIDEO_CSS: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
  backgroundColor: '#000',
  objectFit: 'contain',
  objectPosition: 'center',
};

function isBenignPlayError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === 'AbortError' || err.name === 'NotAllowedError';
}

/** Web-only HLS player using hls.js (Chrome/Firefox do not play .m3u8 natively). */
export function WebHlsVideo({
  uri,
  style,
  muted,
  volume,
  shouldPlay,
  onReady,
  onPlaybackStatusUpdate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<typeof Hls.prototype | null>(null);
  const onReadyRef = useRef(onReady);
  const onStatusRef = useRef(onPlaybackStatusUpdate);
  const shouldPlayRef = useRef(shouldPlay);
  const mutedRef = useRef(muted);
  const playGenRef = useRef(0);
  const mountedRef = useRef(true);

  onReadyRef.current = onReady;
  onStatusRef.current = onPlaybackStatusUpdate;
  shouldPlayRef.current = shouldPlay;
  mutedRef.current = muted;

  const emitStatus = (video: HTMLVideoElement, extra?: Partial<ReelPlaybackStatus>) => {
    const durationSec = video.duration;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;
    onStatusRef.current?.({
      isLoaded: true,
      isPlaying: !video.paused && !video.ended,
      positionMillis: Math.round(video.currentTime * 1000),
      durationMillis: Math.round(durationSec * 1000),
      ...extra,
    });
  };

  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const applyPlayback = (video: HTMLVideoElement) => {
    video.muted = mutedRef.current;
    if (volumeRef.current !== undefined) video.volume = volumeRef.current;
    if (!shouldPlayRef.current) {
      video.pause();
      emitStatus(video);
      return;
    }
    const gen = ++playGenRef.current;
    const result = video.play();
    if (result !== undefined) {
      void result.catch((err: unknown) => {
        if (gen !== playGenRef.current) return;
        if (!isBenignPlayError(err)) {
          console.debug('[WebHlsVideo] play failed', err);
        }
      });
    }
  };

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

    const onTimeUpdate = () => emitStatus(video);
    const onEnded = () => {
      emitStatus(video, { didJustFinish: true });
      if (shouldPlayRef.current) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);

    const destroyHls = () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = uri;
      video.addEventListener('loadeddata', signalReady, { once: true });
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 20,
        startLevel: -1,
      });
      hlsRef.current = hls;
      hls.loadSource(uri);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, signalReady);
    } else {
      video.src = uri;
      video.addEventListener('loadeddata', signalReady, { once: true });
    }

    return () => {
      mountedRef.current = false;
      playGenRef.current += 1;
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
      video.pause();
      video.removeAttribute('src');
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
      <video ref={videoRef} style={VIDEO_CSS} playsInline muted={muted} loop />
    </View>
  );
}
