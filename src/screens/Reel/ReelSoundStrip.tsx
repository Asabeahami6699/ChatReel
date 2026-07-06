import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReelDTO } from '../../lib/api';
import { soundLabel } from './ReelSoundPicker';

type Props = {
  reel: ReelDTO;
  authorHandle: string;
  onPressSound?: (soundId: string) => void;
};

export function ReelSoundStrip({ reel, authorHandle, onPressSound }: Props) {
  const sound = reel.sound;
  const label = sound ? soundLabel(sound) : `Original audio · @${authorHandle}`;
  const canOpen = Boolean(sound && onPressSound);

  if (canOpen) {
    return (
      <TouchableOpacity
        style={styles.musicContainer}
        activeOpacity={0.75}
        onPress={() => onPressSound!(sound!.id)}
      >
        <Text style={styles.music} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.musicContainer}>
      <Text style={styles.music} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  musicContainer: { maxWidth: '92%' },
  music: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
});
