import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import type { ReelDTO, ReelMediaDTO } from '../../lib/api';
import { getMediaPlaybackUrl, isHlsUrl, isImageReelUrl } from '../../lib/reelPlayback';
import { ReelPlayer, type ReelPlaybackStatus, type ReelPlayerHandle } from '../../components/ReelPlayer';
import { WebHlsVideo } from './WebHlsVideo';

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
  isReady,
  videoUri,
  onReady,
  onPlaybackStatus,
  onRef,
}: Props) {
  const isImage = media.media_type === 'image' || isImageReelUrl(media.media_url);
  const playbackUri = videoUri ?? getMediaPlaybackUrl(media);
  const useWebHls = Platform.OS === 'web' && !isImage && isHlsUrl(playbackUri);
  const posterUri = media.thumbnail_url ?? (isImage ? playbackUri : reel.thumbnail_url);
  const showPoster = Boolean(posterUri) && !isReady;
  const imageReadyRef = useRef(false);

  useEffect(() => {
    if (isImage && isActiveSlide && !imageReadyRef.current) {
      imageReadyRef.current = true;
      onReady(slideKey);
      onPlaybackStatus(
        slideKey,
        { isLoaded: true, positionMillis: 0, durationMillis: 5000 },
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
          style={styles.media}
          resizeMode="contain"
          onLoad={() => onReady(slideKey)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.shell, shellStyle]}>
      {showPoster && posterUri && (
        <Image source={{ uri: posterUri }} style={styles.media} resizeMode="contain" />
      )}
      {useWebHls ? (
        <WebHlsVideo
          uri={playbackUri}
          style={styles.media}
          muted={isMuted}
          shouldPlay={isActiveSlide && isPlaying && isFocused}
          onReady={() => onReady(slideKey)}
          onPlaybackStatusUpdate={(status) => onPlaybackStatus(slideKey, status, isActiveSlide)}
        />
      ) : (
        <ReelPlayer
          ref={(ref) => onRef(slideKey, ref)}
          source={playbackUri}
          style={styles.media}
          contentFit="contain"
          shouldPlay={isActiveSlide && isPlaying && isFocused}
          isMuted={isMuted}
          isLooping
          progressUpdateIntervalMillis={isActiveSlide ? 250 : 1000}
          onReadyForDisplay={() => onReady(slideKey)}
          onPlaybackStatusUpdate={(status) => onPlaybackStatus(slideKey, status, isActiveSlide)}
        />
      )}
      {!isReady && !showPoster && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
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
