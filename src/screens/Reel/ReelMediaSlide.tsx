import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import type { ReelDTO, ReelMediaDTO } from '../../lib/api';
import { getMediaPlaybackUrl, isImageReelUrl } from '../../lib/reelPlayback';
import { ReelPlayer, type ReelPlaybackStatus, type ReelPlayerHandle } from '../../components/ReelPlayer';
import { WebHlsVideo } from './WebHlsVideo';
import { WebVideoPoster } from './WebVideoPoster';
import { getReelFilterOverlay, getReelFilterCssFilter } from './reelFilters';

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
  const filterOverlay = getReelFilterOverlay(filterId);
  const filterCss = getReelFilterCssFilter(filterId);
  const showFilter =
    (Boolean(filterOverlay) || Boolean(filterCss)) &&
    (isImage || (media.transcode_status ?? reel.transcode_status) !== 'ready');
  const mediaFilterStyle = showFilter && filterCss ? ({ filter: filterCss } as object) : null;

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
  }, [isImage, isActiveSlide, slideKey, onReady, onPlaybackStatus]);

  const shellStyle = { width: frameWidth, height: frameHeight };

  if (isImage) {
    return (
      <View style={[styles.shell, shellStyle]}>
        <Image
          source={{ uri: playbackUri }}
          style={[styles.media, mediaFilterStyle]}
          resizeMode="cover"
          onLoad={() => onReady(slideKey)}
        />
        {showFilter && filterOverlay ? (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: filterOverlay }]}
            pointerEvents="none"
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.shell, shellStyle]}>
      {showPoster && posterUri && (
        <Image
          source={{ uri: posterUri }}
          style={[styles.media, mediaFilterStyle]}
          resizeMode="cover"
        />
      )}
      {!isReady && !showPoster && useWebStream && (
        <WebVideoPoster uri={playbackUri} posterUri={posterUri} style={styles.media} />
      )}
      {useWebStream ? (
        <View style={[styles.media, mediaFilterStyle]}>
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
        </View>
      ) : (
        <View style={[styles.media, mediaFilterStyle]}>
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
        </View>
      )}
      {!isReady && !showPoster && !useWebStream && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
      {showFilter && filterOverlay ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: filterOverlay }]}
          pointerEvents="none"
        />
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
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
