import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FilterPipeline } from '../lib/filterPipeline';
import {
  isIdentityPipelineFilter,
  reelFilterToPipeline,
} from '../lib/reelFilterPipelineMap';
import type { ReelFilterId } from '../screens/Reel/reelFilters';

type Props = {
  uri: string;
  mediaType: 'image' | 'video';
  filterId?: ReelFilterId | string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover';
  muted?: boolean;
  volume?: number;
  shouldPlay?: boolean;
  isLooping?: boolean;
  onPlaybackStatusUpdate?: (status: {
    isLoaded?: boolean;
    durationMillis?: number;
    positionMillis?: number;
    didJustFinish?: boolean;
  }) => void;
  children?: React.ReactNode;
};

function mediaCss(fit: 'contain' | 'cover'): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    display: 'block',
    backgroundColor: '#000',
    objectFit: fit,
    objectPosition: 'center',
  };
}

/**
 * Live WebGL filter preview (web):
 * hidden source → WebGL shaders + AR overlay → 2D output canvas (visible).
 */
export function WebGlFilterPreview({
  uri,
  mediaType,
  filterId,
  style,
  contentFit = 'contain',
  muted = true,
  volume = 1,
  shouldPlay = true,
  isLooping = true,
  onPlaybackStatusUpdate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const pipelineRef = useRef<FilterPipeline | null>(null);
  const [ready, setReady] = useState(false);
  const identity = isIdentityPipelineFilter(filterId);
  const statusRef = useRef(onPlaybackStatusUpdate);
  statusRef.current = onPlaybackStatusUpdate;

  // Identity path: show raw media (no WebGL)
  useEffect(() => {
    if (!identity) return;
    setReady(true);
    const video = videoRef.current;
    if (mediaType !== 'video' || !video) return;

    video.muted = muted;
    video.volume = Math.max(0, Math.min(1, volume));
    video.loop = isLooping;
    if (shouldPlay) void video.play().catch(() => undefined);
    else video.pause();

    const tick = () => {
      statusRef.current?.({
        isLoaded: video.readyState >= 2,
        durationMillis: (video.duration || 0) * 1000,
        positionMillis: (video.currentTime || 0) * 1000,
      });
    };
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [identity, uri, mediaType, muted, volume, shouldPlay, isLooping]);

  // Filtered path — load pipeline once per media URI
  useEffect(() => {
    if (identity || typeof document === 'undefined') return;

    let cancelled = false;
    let statusTimer: number | null = null;
    const mount = canvasMountRef.current;
    if (!mount) return;

    async function run() {
      setReady(false);
      pipelineRef.current?.destroy();
      pipelineRef.current = null;
      mount!.innerHTML = '';

      try {
        const pipeline = new FilterPipeline(720, 1280);
        await pipeline.load();
        if (cancelled) {
          pipeline.destroy();
          return;
        }
        pipeline.setFilter(reelFilterToPipeline(filterId));
        pipelineRef.current = pipeline;

        const canvas = pipeline.getOutputCanvas();
        Object.assign(canvas.style, mediaCss(contentFit));
        mount!.appendChild(canvas);

        if (mediaType === 'video') {
          const video = videoRef.current;
          if (!video) throw new Error('Missing video element');
          video.crossOrigin = 'anonymous';
          video.muted = muted;
          video.loop = isLooping;
          video.volume = Math.max(0, Math.min(1, volume));

          await new Promise<void>((resolve, reject) => {
            if (video.readyState >= 2) {
              resolve();
              return;
            }
            const onReady = () => {
              cleanup();
              resolve();
            };
            const onErr = () => {
              cleanup();
              reject(new Error('video load failed'));
            };
            const cleanup = () => {
              video.removeEventListener('loadeddata', onReady);
              video.removeEventListener('error', onErr);
            };
            video.addEventListener('loadeddata', onReady);
            video.addEventListener('error', onErr);
          });
          if (cancelled) return;

          if (video.videoWidth > 0 && video.videoHeight > 0) {
            pipeline.setSize(video.videoWidth, video.videoHeight);
          }
          pipeline.start(video);
          if (shouldPlay) await video.play().catch(() => undefined);

          statusTimer = window.setInterval(() => {
            const ended = video.ended;
            statusRef.current?.({
              isLoaded: video.readyState >= 2,
              durationMillis: (video.duration || 0) * 1000,
              positionMillis: (video.currentTime || 0) * 1000,
              didJustFinish: ended,
            });
          }, 200);
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('image load failed'));
            img.src = uri;
          });
          if (cancelled) return;
          await pipeline.filterImage(img, reelFilterToPipeline(filterId));
        }

        if (!cancelled) setReady(true);
      } catch (err) {
        console.warn('[WebGlFilterPreview] failed', err);
        if (!cancelled) setReady(true);
      }
    }

    void run();

    return () => {
      cancelled = true;
      if (statusTimer != null) window.clearInterval(statusTimer);
      pipelineRef.current?.stop();
      pipelineRef.current?.destroy();
      pipelineRef.current = null;
      if (mount) mount.innerHTML = '';
    };
    // Playback props synced below — avoid remounting MediaPipe on play/pause
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, uri, mediaType, contentFit]);

  // Sync play/mute without tearing down the pipeline
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mediaType !== 'video') return;
    video.muted = muted;
    video.loop = isLooping;
    video.volume = Math.max(0, Math.min(1, volume));
    if (shouldPlay) void video.play().catch(() => undefined);
    else video.pause();
  }, [muted, volume, shouldPlay, isLooping, mediaType, ready]);

  // Live filter chip changes
  useEffect(() => {
    if (identity) return;
    const p = pipelineRef.current;
    if (!p) return;
    p.setFilter(reelFilterToPipeline(filterId));
    if (mediaType === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        void pipelineRef.current?.filterImage(img, reelFilterToPipeline(filterId));
      };
      img.src = uri;
    }
  }, [filterId, identity, mediaType, uri]);

  if (identity) {
    return (
      <View style={[styles.host, style]}>
        {mediaType === 'video' ? (
          <video
            key={uri}
            ref={videoRef}
            src={uri}
            style={mediaCss(contentFit)}
            playsInline
            muted={muted}
            loop={isLooping}
            autoPlay={shouldPlay}
            preload="auto"
          />
        ) : (
          <img key={uri} src={uri} alt="" style={mediaCss(contentFit)} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.host, style]}>
      {mediaType === 'video' ? (
        <video
          key={uri}
          ref={videoRef}
          src={uri}
          style={{ display: 'none' }}
          playsInline
          muted={muted}
          loop={isLooping}
          preload="auto"
          crossOrigin="anonymous"
        />
      ) : null}
      <div ref={canvasMountRef} style={{ width: '100%', height: '100%' }} />
      {!ready ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
