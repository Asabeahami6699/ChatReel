import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import type { ReelDTO, ReelMediaDTO } from '../../lib/api';
import { getMediaPlaybackUrl, isHlsUrl, isImageReelUrl } from '../../lib/reelPlayback';
import { ReelPlayer, type ReelPlaybackStatus, type ReelPlayerHandle } from '../../components/ReelPlayer';
import { WebHlsVideo } from './WebHlsVideo';
import { WebVideoPoster } from './WebVideoPoster';
import { MediaFilterFrame } from '../../components/MediaFilterFrame';
import { WebGlFilterPreview } from '../../components/WebGlFilterPreview';
import { isIdentityPipelineFilter } from '../../lib/reelFilterPipelineMap';

type Props = {
  reel: ReelDTO;
  media: ReelMediaDTO;
  frameWidth: number;
  frameHeight: number;
  slideKey: string;
  isActiveSlide: boolean;
  isFocused: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  volume?: number;
  isReady: boolean;
  videoUri?: string;
  onReady: (key: string) => void;
  onPlaybackStatus: (key: string, status: ReelPlaybackStatus, isActive: boolean) => void;
  onRef: (key: string, ref: ReelPlayerHandle | null) => void;
};

export function ReelMediaSlide({
  reel,
  media,
  frameWidth,
  frameHeight,
  slideKey,
  isActiveSlide,
  isFocused,
  isPlaying,
  isMuted,
  volume,
  isReady,
  videoUri,
  onReady,
  onPlaybackStatus,
  onRef,
}: Props) {
  const isImage = media.media_type === 'image' || isImageReelUrl(media.media_url);
  // Never use video-cache .mp4 URIs for image slides (legacy bad cache).
  const playbackUri = isImage
    ? getMediaPlaybackUrl(media)
    : videoUri ?? getMediaPlaybackUrl(media);
  const useWebStream = Platform.OS === 'web' && !isImage;
  const posterUri = media.thumbnail_url ?? (isImage ? playbackUri : reel.thumbnail_url);
  const showPoster = Boolean(posterUri) && !isReady;
  const imageReadyRef = useRef(false);
  const filterId = media.filter_id ?? reel.filter_id;
  const useWebGl =
    Platform.OS === 'web' &&
    Boolean(filterId) &&
    !isIdentityPipelineFilter(filterId) &&
    !(useWebStream && isHlsUrl(playbackUri));

  useEffect(() => {
    if (isImage && isActiveSlide && !imageReadyRef.current) {
      imageReadyRef.current = true;
      onReady(slideKey);
      onPlaybackStatus(
        slideKey,
        {
          isLoaded: true,
          positionMillis: 0,
          durationMillis: Math.max(1000, Math.round((reel.duration ?? 15) * 1000)),
        },
        isActiveSlide
      );
    }
  }, [isImage, isActiveSlide, slideKey, onReady, onPlaybackStatus, reel.duration]);

  const shellStyle = { width: frameWidth, height: frameHeight };

  if (isImage) {
    return (
      <View style={[styles.shell, shellStyle]}>
        {useWebGl ? (
          <WebGlFilterPreview
            key={`${slideKey}-${filterId}`}
            uri={playbackUri}
            mediaType="image"
            filterId={filterId}
            style={styles.media}
            contentFit="cover"
          />
        ) : (
          <MediaFilterFrame filterId={filterId} style={styles.media}>
            <Image
              source={{ uri: playbackUri }}
              style={styles.media}
              resizeMode="cover"
              onLoad={() => onReady(slideKey)}
            />
          </MediaFilterFrame>
        )}
      </View>
    );
  }

  if (useWebGl) {
    return (
      <View style={[styles.shell, shellStyle]}>
        <WebGlFilterPreview
          key={`${slideKey}-${filterId}`}
          uri={playbackUri}
          mediaType="video"
          filterId={filterId}
          style={styles.media}
          contentFit="cover"
          shouldPlay={isActiveSlide && isPlaying && isFocused}
          isLooping={false}
          muted={isMuted}
          volume={volume}
          onPlaybackStatusUpdate={(status) =>
            onPlaybackStatus(slideKey, status as ReelPlaybackStatus, isActiveSlide)
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.shell, shellStyle]}>
      {showPoster && posterUri ? (
        <MediaFilterFrame filterId={filterId} style={styles.media}>
          <Image source={{ uri: posterUri }} style={styles.media} resizeMode="cover" />
        </MediaFilterFrame>
      ) : null}
      {!isReady && !showPoster && useWebStream ? (
        <WebVideoPoster uri={playbackUri} posterUri={posterUri} style={styles.media} />
      ) : null}
      {useWebStream ? (
        <MediaFilterFrame filterId={filterId} style={styles.media}>
          <WebHlsVideo
            ref={(playerRef) => onRef(slideKey, playerRef)}
            uri={playbackUri}
            style={styles.media}
            muted={isMuted}
            volume={volume}
            shouldPlay={isActiveSlide && isPlaying && isFocused}
            contentFit="cover"
            onReady={() => onReady(slideKey)}
            onPlaybackStatusUpdate={(status) => onPlaybackStatus(slideKey, status, isActiveSlide)}
          />
        </MediaFilterFrame>
      ) : (
        <MediaFilterFrame filterId={filterId} style={styles.media}>
          <ReelPlayer
            ref={(ref) => onRef(slideKey, ref)}
            source={playbackUri}
            style={styles.media}
            contentFit="cover"
            shouldPlay={isActiveSlide && isPlaying && isFocused}
            isMuted={isMuted}
            volume={volume}
            isLooping={false}
            progressUpdateIntervalMillis={isActiveSlide ? 250 : 1000}
            onReadyForDisplay={() => onReady(slideKey)}
            onPlaybackStatusUpdate={(status) => onPlaybackStatus(slideKey, status, isActiveSlide)}
          />
        </MediaFilterFrame>
      )}
      {!isReady && !showPoster && !useWebStream ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
