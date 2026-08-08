import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import { soundLabel } from './ReelSoundPicker';
import { reelHasExtractableAudio } from './reelSoundUtils';

type Props = {
  reel: ReelDTO;
  authorHandle: string;
  /** Open the sound library / detail page. */
  onPressSound?: (soundId: string) => void;
  /** Start a new reel with this library sound (compose). */
  onUseThisSound?: (reel: ReelDTO) => void;
  onPressOriginalAudio?: (reel: ReelDTO) => void;
};

export function ReelSoundStrip({
  reel,
  authorHandle,
  onPressSound,
  onUseThisSound,
  onPressOriginalAudio,
}: Props) {
  const sound = reel.sound;
  const label = sound ? soundLabel(sound) : `Original audio · @${authorHandle}`;
  const canOpenLibrary = Boolean(sound && onPressSound);
  const canUseSound = Boolean(sound && onUseThisSound);
  const canOpenOriginal =
    Boolean(!sound && onPressOriginalAudio && reelHasExtractableAudio(reel));

  if (canOpenLibrary || canUseSound) {
    return (
      <View style={styles.wrap}>
        <TouchableOpacity
          style={styles.musicContainer}
          activeOpacity={0.75}
          onPress={() => {
            if (canOpenLibrary) onPressSound!(sound!.id);
            else onUseThisSound?.(reel);
          }}
        >
          <Ionicons name="musical-notes" size={12} color="rgba(255,255,255,0.85)" />
          <Text style={styles.music} numberOfLines={1}>
            {label}
          </Text>
        </TouchableOpacity>
        {canUseSound ? (
          <TouchableOpacity
            style={styles.useSoundBtn}
            activeOpacity={0.88}
            onPress={() => onUseThisSound!(reel)}
          >
            <Text style={styles.useSoundText}>Use this sound</Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
  wrap: { maxWidth: '92%', gap: 6 },
  musicContainer: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  music: { color: 'rgba(255,255,255,0.85)', fontSize: 12, flexShrink: 1 },
  useSoundBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  useSoundText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
