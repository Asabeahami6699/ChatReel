import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import { soundLabel } from './ReelSoundPicker';
import { reelHasExtractableAudio } from './reelSoundUtils';

type Props = {
  reel: ReelDTO;
  authorHandle: string;
  onPressSound?: (soundId: string) => void;
  onPressOriginalAudio?: (reel: ReelDTO) => void;
};

export function ReelSoundStrip({ reel, authorHandle, onPressSound, onPressOriginalAudio }: Props) {
  const sound = reel.sound;
  const label = sound ? soundLabel(sound) : `Original audio · @${authorHandle}`;
  const canOpenLibrary = Boolean(sound && onPressSound);
  const canOpenOriginal =
    Boolean(!sound && onPressOriginalAudio && reelHasExtractableAudio(reel));

  if (canOpenLibrary) {
    return (
      <TouchableOpacity
        style={styles.musicContainer}
        activeOpacity={0.75}
        onPress={() => onPressSound!(sound!.id)}
      >
        <Ionicons name="musical-notes" size={12} color="rgba(255,255,255,0.85)" />
        <Text style={styles.music} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  if (canOpenOriginal) {
    return (
      <TouchableOpacity
        style={styles.musicContainer}
        activeOpacity={0.75}
        onPress={() => onPressOriginalAudio!(reel)}
      >
        <Ionicons name="musical-notes" size={12} color="rgba(255,255,255,0.85)" />
        <Text style={styles.music} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.musicContainer}>
      <Ionicons name="musical-notes" size={12} color="rgba(255,255,255,0.65)" />
      <Text style={styles.music} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  musicContainer: {
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  music: { color: 'rgba(255,255,255,0.85)', fontSize: 12, flexShrink: 1 },
});
