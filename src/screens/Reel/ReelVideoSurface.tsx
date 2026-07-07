import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ReelDTO } from '../../lib/api';
import { getReelPlaybackUrl, isImageReelUrl } from '../../lib/reelPlayback';
import { ReelPlayer, type ReelPlaybackStatus, type ReelPlayerHandle } from '../../components/ReelPlayer';
import { getReelVideoLayout } from './reelVideoLayout';
import { isReelNearViewport } from './reelVideoCache';
import { WebHlsVideo } from './WebHlsVideo';

type Props = {
  reel: ReelDTO;
  index: number;
  currentIndex: number;
  videoUri: string;
  isFocused: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  isReady: boolean;
  onReady: (reelId: string) => void;
  onPlaybackStatus: (reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => void;
  onRef: (reelId: string, ref: ReelPlayerHandle | null) => void;
};

function playbackHint(reel: ReelDTO): string | null {
  if (reel.moderation_status === 'flagged') {
    return 'This reel is under review. Playback may be limited.';
  }
  if (reel.transcode_status === 'failed') {
    return 'Video processing failed. Try again later or re-upload.';
  }
  if (reel.transcode_status === 'processing' || reel.transcode_status === 'pending') {
    return 'Video is still processing…';
  }
  return null;
}

export function ReelVideoSurface({
  reel,
  index,
  currentIndex,
  videoUri,
  isFocused,
  isPlaying,
  isMuted,
  isReady,
  onReady,
  onPlaybackStatus,
  onRef,
}: Props) {
  const { width: frameWidth, height: frameHeight } = useWindowDimensions();
  const isCurrent = index === currentIndex;
  const isNear = isReelNearViewport(index, currentIndex);
  const isImage =
    isImageReelUrl(videoUri) ||
    isImageReelUrl(reel.video_url) ||
    (!reel.duration && isImageReelUrl(reel.thumbnail_url ?? ''));
  const useWebStream = Platform.OS === 'web' && !isImage;
  const videoLayout = getReelVideoLayout(reel, frameWidth, frameHeight);
  const posterUri = reel.thumbnail_url ?? (isImage ? videoUri : null);
  const showPoster = Boolean(posterUri) && (!isReady || !isNear);
  const imageReadyRef = useRef(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const hint = playbackHint(reel);

  useEffect(() => {
    if (!isNear || isReady || isImage) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimedOut(true), 12_000);
    return () => clearTimeout(timer);
  }, [isImage, isNear, isReady, reel.id, videoUri]);

  useEffect(() => {
    if (isImage && isNear && !imageReadyRef.current) {
      imageReadyRef.current = true;
      onReady(reel.id);
      onPlaybackStatus(
        reel.id,
        { isLoaded: true, positionMillis: 0, durationMillis: 5000 },
        isCurrent
      );
    }
  }, [isImage, isNear, reel.id, isCurrent, onReady, onPlaybackStatus]);

  if (isImage) {
    return (
      <View style={styles.shell}>
        <View style={[styles.frame, videoLayout]}>
          <Image
            source={{ uri: videoUri || reel.video_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onLoad={() => onReady(reel.id)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={[styles.frame, videoLayout]}>
        {showPoster && (
          <Image
            source={{ uri: posterUri! }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        )}
        {isNear ? (
          useWebStream ? (
            <WebHlsVideo
              uri={videoUri}
              style={StyleSheet.absoluteFill}
              muted={isMuted}
              shouldPlay={isCurrent && isPlaying && isFocused}
              onReady={() => onReady(reel.id)}
              onPlaybackStatusUpdate={(status) => onPlaybackStatus(reel.id, status, isCurrent)}
            />
          ) : (
            <ReelPlayer
              ref={(ref) => onRef(reel.id, ref)}
              source={videoUri}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              shouldPlay={isCurrent && isPlaying && isFocused}
              isMuted={isMuted}
              isLooping
              progressUpdateIntervalMillis={isCurrent ? 250 : 1000}
              onReadyForDisplay={() => onReady(reel.id)}
              onPlaybackStatusUpdate={(status) => onPlaybackStatus(reel.id, status, isCurrent)}
            />
          )
        ) : (
          posterUri && (
            <Image
              source={{ uri: posterUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
          )
        )}
        {isNear && !isReady && !showPoster && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            {(loadTimedOut || hint) && (
              <Text style={styles.hintText}>
                {hint ?? 'Video is taking longer than usual to load.'}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 24,
  },
  hintText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
});
