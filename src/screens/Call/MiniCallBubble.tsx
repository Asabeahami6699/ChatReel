import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  peerName: string;
  peerAvatar: string | null;
  durationLabel: string;
  muted: boolean;
  onExpand: () => void;
  onToggleMute: () => void;
  onEnd: () => void;
};

/** Floating bubble while the full call UI is minimized over Main. */
export function MiniCallBubble({
  peerName,
  peerAvatar,
  durationLabel,
  muted,
  onExpand,
  onToggleMute,
  onEnd,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}
    >
      <View style={styles.bubble}>
        <TouchableOpacity style={styles.mainTap} onPress={onExpand} activeOpacity={0.9}>
          {peerAvatar ? (
            <Image source={{ uri: peerAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{peerName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.name} numberOfLines={1}>
              {peerName}
            </Text>
            <Text style={styles.duration}>{durationLabel}</Text>
          </View>
          <Ionicons name="chevron-up" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, muted && styles.iconBtnActive]}
          onPress={onToggleMute}
          accessibilityLabel={muted ? 'Unmute' : 'Mute'}
        >
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, styles.endBtn]}
          onPress={onEnd}
          accessibilityLabel="End call"
        >
          <Ionicons name="call" size={18} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    zIndex: 100,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.94)',
    borderRadius: 28,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 8,
    gap: 6,
    maxWidth: 320,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  mainTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    paddingRight: 4,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    backgroundColor: '#1976d2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '700', fontSize: 16 },
  meta: { flexShrink: 1, maxWidth: 120 },
  name: { color: '#fff', fontWeight: '700', fontSize: 13 },
  duration: { color: '#94a3b8', fontSize: 11, marginTop: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: '#2563eb' },
  endBtn: { backgroundColor: '#ef4444' },
});
