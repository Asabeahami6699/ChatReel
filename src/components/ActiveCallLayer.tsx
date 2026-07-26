import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActiveCallContent } from '../screens/Call/ActiveCallScreen';
import { OutgoingConnectingView } from '../screens/Call/OutgoingConnectingView';
import {
  getCallPipSnapshot,
  subscribeCallPip,
  type CallPipSnapshot,
} from '../screens/Call/callPipBridge';

/**
 * Hosts the active call outside the navigation stack.
 * Minimize shrinks this host to 1×1 (pointerEvents none) so Main is tappable
 * while LiveKit stays mounted — no disconnect / reconnect.
 */
export function ActiveCallLayer() {
  const [snap, setSnap] = useState<CallPipSnapshot>(getCallPipSnapshot);

  useEffect(() => subscribeCallPip(() => setSnap(getCallPipSnapshot())), []);

  if (snap.connecting && !snap.token) {
    return (
      <View style={styles.fullHost} pointerEvents="auto" collapsable={false}>
        <OutgoingConnectingView
          peerName={snap.peerName}
          peerAvatar={snap.peerAvatar}
          callType={snap.callType}
        />
      </View>
    );
  }

  if (!snap.active || !snap.call || !snap.token || !snap.url) {
    return null;
  }

  return (
    <View
      style={snap.minimized ? styles.pipHost : styles.fullHost}
      pointerEvents={snap.minimized ? 'none' : 'auto'}
      collapsable={false}
    >
      <ActiveCallContent
        embedded
        call={snap.call}
        token={snap.token}
        url={snap.url}
        layerMinimized={snap.minimized}
      />
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
    elevation: 9000,
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
