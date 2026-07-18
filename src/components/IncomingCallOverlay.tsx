import React, { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import { useIncomingCall } from '../hooks/useIncomingCall';
import IncomingCallScreen from '../screens/Call/IncomingCallScreen';
import { rememberCallReturnPoint } from '../navigation/callSessionNav';
import { useAuth } from '../hooks/useAuth';
import { fetchCallPeerInfo } from '../screens/Call/callPeerInfo';
import { getCallPipSnapshot, subscribeCallPip } from '../screens/Call/callPipBridge';

/**
 * Global ringer overlay. Supports call waiting: when already on ActiveCall,
 * accept puts that call on hold and joins the waiting caller.
 */
export function IncomingCallOverlay() {
  const incoming = useIncomingCall();
  const { user } = useAuth();
  const [suppressedCallId, setSuppressedCallId] = useState<string | null>(null);
  const [peer, setPeer] = useState<{
    display_name: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [onActiveCall, setOnActiveCall] = useState(false);

  useEffect(() => {
    setOnActiveCall(getCallPipSnapshot().active);
    return subscribeCallPip(() => {
      setOnActiveCall(getCallPipSnapshot().active);
    });
  }, []);

  useEffect(() => {
    if (incoming && suppressedCallId && incoming.id !== suppressedCallId) {
      setSuppressedCallId(null);
    }
    if (!incoming) setSuppressedCallId(null);
  }, [incoming, suppressedCallId]);

  const activeIncoming =
    incoming && incoming.id !== suppressedCallId ? incoming : null;

  useEffect(() => {
    if (activeIncoming?.status === 'ringing') {
      rememberCallReturnPoint();
    }
  }, [activeIncoming?.id, activeIncoming?.status]);

  useEffect(() => {
    if (!activeIncoming) {
      setPeer(null);
      return;
    }
    let alive = true;
    (async () => {
      const info = await fetchCallPeerInfo(activeIncoming, user?.id ?? null, {
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
  }, [activeIncoming, user?.id]);

  const visible =
    !!activeIncoming &&
    (activeIncoming.status === 'ringing' || activeIncoming.status === 'accepted');

  const dismiss = () => {
    if (activeIncoming?.id) setSuppressedCallId(activeIncoming.id);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => {
        /* Decline via IncomingCallScreen only */
      }}
    >
      {activeIncoming ? (
        <IncomingCallScreen
          call={activeIncoming}
          peer={peer}
          onDismiss={dismiss}
          waitingWhileBusy={onActiveCall}
        />
      ) : null}
    </Modal>
  );
}
