import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CallDTO } from '../lib/api';

type Props = {
  call: CallDTO;
  joinedCount: number;
  onJoin: () => void;
};

export function GroupCallBanner({ call, joinedCount, onJoin }: Props) {
  const isVideo = call.call_type === 'video';
  return (
    <TouchableOpacity style={styles.banner} onPress={onJoin} activeOpacity={0.85}>
      <View style={styles.iconWrap}>
        <Ionicons name={isVideo ? 'videocam' : 'call'} size={18} color="#fff" />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>
          {isVideo ? 'Group video call' : 'Group voice call'} in progress
        </Text>
        <Text style={styles.sub}>
          {joinedCount} participant{joinedCount === 1 ? '' : 's'} · Tap to join
        </Text>
      </View>
      <Ionicons name="arrow-forward-circle" size={24} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
});
