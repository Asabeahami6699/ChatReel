import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  peerName: string;
  incomingVisible: boolean;
  outgoingVisible: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function VideoRequestOverlay({
  peerName,
  incomingVisible,
  outgoingVisible,
  onAccept,
  onDecline,
}: Props) {
  if (!incomingVisible && !outgoingVisible) return null;

  return (
    <View style={styles.wrap}>
      {incomingVisible ? (
        <View style={styles.card}>
          <Ionicons name="videocam" size={22} color="#fff" />
          <Text style={styles.title}>{peerName} wants to switch to video</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={onDecline}>
              <Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={onAccept}>
              <Text style={styles.btnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Ionicons name="videocam-outline" size={20} color="#fff" />
          <Text style={styles.pendingText}>Waiting for {peerName} to accept video…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 140,
    zIndex: 30,
  },
  card: {
    backgroundColor: 'rgba(20,20,20,0.92)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  pendingText: {
    color: '#d1d5db',
    fontSize: 14,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  declineBtn: { backgroundColor: '#374151' },
  acceptBtn: { backgroundColor: '#16a34a' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
