import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { ActiveCallContent } from '../screens/Call/ActiveCallScreen';
import { OutgoingConnectingView } from '../screens/Call/OutgoingConnectingView';
import {
  getCallPipSnapshot,
  subscribeCallPip,
  type CallPipSnapshot,
} from '../screens/Call/callPipBridge';

/**
 * Hosts the active / connecting call outside the navigation stack.
 * Uses a full-screen Modal on Android so friend-picker Modals cannot cover it.
 * When minimized, LiveKit stays mounted in a 1×1 host under Main.
 */
export function ActiveCallLayer() {
  const [snap, setSnap] = useState<CallPipSnapshot>(getCallPipSnapshot);

  useEffect(() => subscribeCallPip(() => setSnap(getCallPipSnapshot())), []);

  const showConnecting = snap.connecting && !snap.token;
  const showActive = snap.active && !!snap.call && !!snap.token && !!snap.url;
  const showFullScreen = showConnecting || (showActive && !snap.minimized);

  if (!showConnecting && !showActive) {
    return null;
  }

  const content = showConnecting ? (
    <OutgoingConnectingView
      peerName={snap.peerName}
      peerAvatar={snap.peerAvatar}
      callType={snap.callType}
    />
  ) : snap.call && snap.token && snap.url ? (
    <ActiveCallContent
      embedded
      call={snap.call}
      token={snap.token}
      url={snap.url}
      layerMinimized={snap.minimized}
    />
  ) : null;

  // Minimized: keep LiveKit alive in a tiny off-screen host (not a Modal).
  if (showActive && snap.minimized) {
    return (
      <View style={styles.pipHost} pointerEvents="none" collapsable={false}>
        {content}
      </View>
    );
  }

  // Full-screen: Modal on Android so it stacks above other Modals (picker, sheets).
  if (Platform.OS === 'android' && showFullScreen) {
    return (
      <Modal
        visible
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => undefined}
      >
        <View style={styles.modalFill} collapsable={false}>
          {content}
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.fullHost} pointerEvents="auto" collapsable={false}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fullHost: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9000,
    elevation: 10000,
  },
  modalFill: {
    flex: 1,
    backgroundColor: '#000',
  },
  pipHost: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    zIndex: 1,
    elevation: 1,
  },
});
