import React, { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import { useIncomingCall } from '../hooks/useIncomingCall';
import IncomingCallScreen from '../screens/Call/IncomingCallScreen';
import { rememberCallReturnPoint } from '../navigation/callSessionNav';
import { useAuth } from '../hooks/useAuth';
import { fetchCallPeerInfo } from '../screens/Call/callPeerInfo';

/**
 * Global ringer overlay. Rendered once at the app shell level.
 * Pops up an `IncomingCallScreen` whenever a `calls` row in 'ringing' state
 * targets the current user. Auto-dismisses if we navigate to ActiveCall, or
 * if the call leaves ringing.
 */
export function IncomingCallOverlay() {
  const incoming = useIncomingCall();
  const { user } = useAuth();
  const [suppressedCallId, setSuppressedCallId] = useState<string | null>(null);
  const [peer, setPeer] = useState<{
    display_name: string | null;
    avatar_url: string | null;
  } | null>(null);

  // New incoming call → clear prior dismiss so the next ring can show.
  useEffect(() => {
    if (incoming && suppressedCallId && incoming.id !== suppressedCallId) {
      setSuppressedCallId(null);
    }
    if (!incoming) setSuppressedCallId(null);
  }, [incoming, suppressedCallId]);

  const activeCall =
    incoming && incoming.id !== suppressedCallId ? incoming : null;

  useEffect(() => {
    if (activeCall?.status === 'ringing') {
      rememberCallReturnPoint();
    }
  }, [activeCall?.id, activeCall?.status]);

  useEffect(() => {
    if (!activeCall) {
      setPeer(null);
      return;
    }
    let alive = true;
    (async () => {
      const info = await fetchCallPeerInfo(activeCall, user?.id ?? null, {
        preferIncomingCaller: true,
      });
      if (!alive) return;
      setPeer({
        display_name: info.peerName,
        avatar_url: info.peerAvatar,
      });
    })();
    return () => {
      alive = false;
    };
  }, [activeCall, user?.id]);

  const visible =
    !!activeCall &&
    (activeCall.status === 'ringing' || activeCall.status === 'accepted');

  const dismiss = () => {
    if (activeCall?.id) setSuppressedCallId(activeCall.id);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => {
        /* Decline is handled by IncomingCallScreen buttons only. */
      }}
    >
      {activeCall ? (
        <IncomingCallScreen call={activeCall} peer={peer} onDismiss={dismiss} />
      ) : null}
    </Modal>
  );
}
