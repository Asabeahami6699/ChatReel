import React from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallRingtone } from '../../hooks/useCallRingtone';
import { clearCallPip } from './callPipBridge';
import { leaveCallScreen } from '../../navigation/callSessionNav';

type Props = {
  peerName: string;
  peerAvatar?: string | null;
  callType?: 'voice' | 'video';
};

/**
 * Instant outgoing chrome shown while permissions/API finish.
 * Replaced by ActiveCallContent once LiveKit credentials arrive.
 */
export function OutgoingConnectingView({ peerName, peerAvatar, callType = 'voice' }: Props) {
  const insets = useSafeAreaInsets();
  useCallRingtone('outgoing');

  const cancel = () => {
    clearCallPip();
    leaveCallScreen('Calls', 'Call cancelled');
  };

  const initial = (peerName || 'C').charAt(0).toUpperCase();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <StatusBar barStyle="light-content" />
      {peerAvatar ? (
        <Image source={{ uri: peerAvatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarFallbackText}>{initial}</Text>
        </View>
      )}
      <Ionicons
        name={callType === 'video' ? 'videocam-outline' : 'call-outline'}
        size={60}
        color="#fff"
      />
      <Text style={styles.title}>Calling...</Text>
      <Text style={styles.peerName}>{peerName || 'Contact'}</Text>
      <Text style={styles.subtitle}>Connecting…</Text>

      <TouchableOpacity style={styles.endBtn} onPress={cancel} accessibilityLabel="Cancel call">
        <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 20 },
  peerName: { color: '#d1d5db', fontSize: 18, fontWeight: '600', marginTop: 10 },
  subtitle: { color: '#a3a3a3', fontSize: 14, marginTop: 8 },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  avatarFallback: {
    backgroundColor: '#1976d2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: '#fff', fontSize: 46, fontWeight: '700' },
  endBtn: {
    marginTop: 40,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
