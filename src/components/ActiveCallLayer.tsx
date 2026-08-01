import React, { useEffect, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActiveCallContent } from '../screens/Call/ActiveCallScreen';
import { OutgoingConnectingView } from '../screens/Call/OutgoingConnectingView';
import {
  getCallPipSnapshot,
  subscribeCallPip,
  type CallPipSnapshot,
} from '../screens/Call/callPipBridge';
import { useChatSettings } from '../context/ChatSettingsContext';
import { preventCallCapture, allowCallCapture } from '../lib/screenCaptureGuard';

/**
 * Hosts the active / connecting call outside the navigation stack.
 * Uses a full-screen Modal on Android so friend-picker Modals cannot cover it.
 * When minimized, LiveKit stays mounted in a 1×1 host under Main.
 */
export function ActiveCallLayer() {
  const [snap, setSnap] = useState<CallPipSnapshot>(getCallPipSnapshot);
  const { settings } = useChatSettings();
  const [appBackgrounded, setAppBackgrounded] = useState(
    AppState.currentState !== 'active'
  );

  useEffect(() => subscribeCallPip(() => setSnap(getCallPipSnapshot())), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppBackgrounded(next !== 'active');
    });
    return () => sub.remove();
  }, []);

  const showConnecting = snap.connecting && !snap.token;
  const showActive = snap.active && !!snap.call && !!snap.token && !!snap.url;
  const showFullScreen = showConnecting || (showActive && !snap.minimized);
  const privacyCover =
    settings.callPrivacyOnBackground &&
    showActive &&
    !snap.minimized &&
    appBackgrounded;

  // Block screen capture while on an active call if privacy is on.
  useEffect(() => {
    if (!settings.callPrivacyOnBackground || !showActive || snap.minimized) return;
    void preventCallCapture();
    return () => {
      void allowCallCapture();
    };
  }, [settings.callPrivacyOnBackground, showActive, snap.minimized]);

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

  const privacyOverlay = privacyCover ? (
    <View style={styles.privacyCover} pointerEvents="none">
      <Ionicons name="eye-off" size={36} color="#fff" />
      <Text style={styles.privacyTitle}>Call protected</Text>
      <Text style={styles.privacySub}>Preview hidden while you are away</Text>
    </View>
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
          {privacyOverlay}
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.fullHost} pointerEvents="auto" collapsable={false}>
      {content}
      {showFullScreen ? privacyOverlay : null}
    </View>
  );
}

const styles = StyleSheet.create({
  privacyCover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
    backgroundColor: '#050814',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  privacyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 8 },
  privacySub: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },
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
