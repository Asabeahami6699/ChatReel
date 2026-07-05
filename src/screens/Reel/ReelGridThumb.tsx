import React from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import { getReelGridThumbnail } from '../../lib/reelThumbnails';
import { isImageReelUrl } from '../../lib/reelPlayback';

type Props = {
  reel: ReelDTO;
  generatedUri?: string;
  style?: StyleProp<ViewStyle>;
};

function videoPreviewUrl(reel: ReelDTO): string | null {
  const media = reel.media?.[0];
  if (media?.media_type === 'image') return media.media_url;
  return reel.playback_url ?? reel.video_url ?? media?.media_url ?? null;
}

/** Grid tile preview — uses stored thumb, generated thumb, or a web video frame. */
export function ReelGridThumb({ reel, generatedUri, style }: Props) {
  const thumb = getReelGridThumbnail(reel, generatedUri ? { [reel.id]: generatedUri } : undefined);
  const preview = videoPreviewUrl(reel);

  if (thumb) {
    return <Image source={{ uri: thumb }} style={style} resizeMode="cover" />;
  }

  if (Platform.OS === 'web' && preview && !isImageReelUrl(preview)) {
    return (
      <View style={[styles.fill, style]}>
        {React.createElement('video', {
          src: `${preview}#t=0.5`,
          muted: true,
          playsInline: true,
          preload: 'metadata',
          style: {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            backgroundColor: '#111',
            pointerEvents: 'none',
          },
        })}
      </View>
    );
  }

  return (
    <View style={[styles.fill, styles.placeholder, style]}>
      <Ionicons name="film-outline" size={28} color="#666" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: {
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
