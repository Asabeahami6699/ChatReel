import React, { useEffect, useState } from 'react';
import { View, Image, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

async function grabThumbnail(uri: string): Promise<string | null> {
  const cached = cache.get(uri);
  if (cached) return cached;
  const inflight = pending.get(uri);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, {
        time: 500,
        quality: 0.6,
      });
      cache.set(uri, thumb);
      return thumb;
    } catch {
      return null;
    } finally {
      pending.delete(uri);
    }
  })();

  pending.set(uri, task);
  return task;
}

type Props = {
  /** Video source (local file uri or remote url). */
  videoUri: string;
  /** Pre-generated thumbnail (e.g. captured at send time). */
  localThumb?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Renders a still preview frame for a chat video bubble.
 * - Native: uses a provided thumbnail, otherwise extracts a frame from the video.
 * - Web: renders an HTML <video> element showing the first frame as a poster.
 */
export function ChatVideoThumb({ videoUri, localThumb, style }: Props) {
  const [thumb, setThumb] = useState<string | null>(
    localThumb || cache.get(videoUri) || null
  );

  useEffect(() => {
    if (localThumb) {
      setThumb(localThumb);
      return;
    }
    if (Platform.OS === 'web' || !videoUri) return;

    let active = true;
    void grabThumbnail(videoUri).then((uri) => {
      if (active && uri) setThumb(uri);
    });
    return () => {
      active = false;
    };
  }, [videoUri, localThumb]);

  if (Platform.OS === 'web' && !thumb && videoUri) {
    return (
      <View style={[styles.fill, style]}>
        {React.createElement('video', {
          src: `${videoUri}#t=0.1`,
          muted: true,
          playsInline: true,
          preload: 'metadata',
          style: { width: '100%', height: '100%', objectFit: 'cover' },
        })}
      </View>
    );
  }

  return (
    <View style={[styles.fill, style]}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.fill} resizeMode="cover" />
      ) : (
        <View style={[styles.fill, styles.placeholder]}>
          <Ionicons name="videocam" size={32} color="rgba(255,255,255,0.7)" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: {
    backgroundColor: '#1f2933',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
