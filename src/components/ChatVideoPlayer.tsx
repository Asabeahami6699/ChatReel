import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ReelPlayer } from './ReelPlayer';

type Props = {
  uri: string;
  thumbnailUri?: string;
  style?: { width: number; height: number };
  /** Preview composer — always show controls. */
  previewMode?: boolean;
};

/** WhatsApp-style inline video: tap play, native controls when playing. */
export function ChatVideoPlayer({
  uri,
  thumbnailUri,
  style,
  previewMode = false,
}: Props) {
  const [playing, setPlaying] = useState(previewMode);

  const width = style?.width ?? 260;
  const height = style?.height ?? 200;

  if (previewMode) {
    return (
      <View style={[styles.wrap, { width, height }]}>
        <ReelPlayer
          source={uri}
          style={styles.video}
          nativeControls
          shouldPlay={false}
          isLooping={false}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width, height }]}>
      <ReelPlayer
        source={uri}
        style={styles.video}
        shouldPlay={playing}
        nativeControls={playing}
        isLooping={false}
      />
      {!playing && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={0.85}
          onPress={() => setPlaying(true)}
        >
          {thumbnailUri ? (
            <Image source={{ uri: thumbnailUri }} style={styles.thumb} resizeMode="cover" />
          ) : null}
          <View style={styles.playBtn}>
            <MaterialIcons name="play-circle-filled" size={52} color="rgba(255,255,255,0.95)" />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  thumb: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
