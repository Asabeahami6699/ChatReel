import React, { useEffect, useMemo } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallRingtone } from '../../hooks/useCallRingtone';
import { replaceWithActiveCall } from '../../navigation/rootNavigation';
import { api, ApiError, type CallDTO } from '../../lib/api';
import { showAppToast } from '../../lib/appToast';
import { formatCallPeerName } from './callPeerInfo';
import { beginCallHoldDisconnect } from './callHoldIntent';
import { setHeldCallSession } from './callHeldSession';
import { getCallPipSnapshot } from './callPipBridge';

interface Props {
  call: CallDTO;
  peer: { display_name: string | null; avatar_url: string | null } | null;
  onDismiss: () => void;
  /** True when accepting will put the current call on hold. */
  waitingWhileBusy?: boolean;
}

function isOnActiveCall(): boolean {
  try {
    return getCallPipSnapshot().active;
  } catch {
    return false;
  }
}

export default function IncomingCallScreen({
  call,
  peer,
  onDismiss,
  waitingWhileBusy: waitingProp,
}: Props) {
  const insets = useSafeAreaInsets();
  const waitingWhileBusy = waitingProp ?? isOnActiveCall();
  useCallRingtone(call.status === 'ringing' ? 'incoming' : null);
  const [caller, setCaller] = React.useState<{
    display_name: string | null;
    avatar_url: string | null;
  } | null>(peer);

  useEffect(() => {
    const PATTERN = [0, 800, 600, 800, 600];
    Vibration.vibrate(PATTERN, true);
    return () => Vibration.cancel();
  }, []);

  useEffect(() => {
    if (peer?.display_name) {
      setCaller(peer);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { profile } = (await api.profiles.getByUserId(call.caller_id)) as {
          profile: {
            display_name: string | null;
            email?: string | null;
            avatar_url: string | null;
          };
        };
        if (!alive) return;
        setCaller({
          display_name: formatCallPeerName(profile),
          avatar_url: profile?.avatar_url ?? null,
        });
      } catch {
        /* fallback */
      }
    })();
    return () => {
      alive = false;
    };
  }, [call.caller_id, peer]);

  const acceptingRef = React.useRef(false);

  const accept = async () => {
    if (acceptingRef.current) return;
    acceptingRef.current = true;
    Vibration.cancel();
    onDismiss();
    try {
      if (waitingWhileBusy) {
        beginCallHoldDisconnect();
        const { held_call, call: acceptedCall, live_kit } = await api.calls.answerWaiting(
          call.id
        );
        if (held_call) {
          setHeldCallSession({
            call: held_call,
            peerName: 'On hold',
          });
        }
        replaceWithActiveCall({
          call: acceptedCall,
          token: live_kit.token,
          url: live_kit.url,
        });
        showAppToast('Other call put on hold');
        return;
      }

      const { call: acceptedCall, live_kit } = await api.calls.accept(call.id);
      replaceWithActiveCall({
        call: acceptedCall,
        token: live_kit.token,
        url: live_kit.url,
      });
    } catch (err) {
      acceptingRef.current = false;
      const message = err instanceof ApiError ? err.message : 'Could not join the call';
      showAppToast(message, { isError: true });
    }
  };

  const decline = async () => {
    Vibration.cancel();
    onDismiss();
    try {
      await api.calls.decline(call.id);
    } catch {
      /* ignore */
    }
  };

  const displayName = useMemo(() => {
    return caller?.display_name?.trim() || 'Incoming call';
  }, [caller?.display_name]);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.top}>
        <Text style={styles.subtitle}>
          {waitingWhileBusy
            ? `Call waiting · ${call.call_type}`
            : call.scope === 'group'
              ? `Incoming ${call.call_type} group call`
              : `Incoming ${call.call_type} call`}
        </Text>
        {caller?.avatar_url ? (
          <Image source={{ uri: caller.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.name}>{displayName}</Text>
        {waitingWhileBusy ? (
          <Text style={styles.holdHint}>Answer to put your current call on hold</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={() => void decline()}>
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={() => void accept()}>
          <Ionicons
            name={call.call_type === 'video' ? 'videocam' : 'call'}
            size={28}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1f33',
    justifyContent: 'space-between',
  },
  top: { alignItems: 'center', gap: 16 },
  subtitle: { color: '#aac4e1', fontSize: 14 },
  holdHint: { color: '#fbbf24', fontSize: 13, fontWeight: '600', marginTop: 4 },
  avatar: { width: 120, height: 120, borderRadius: 60, marginTop: 24 },
  avatarFallback: {
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { color: '#fff', fontSize: 48, fontWeight: '700' },
  name: { color: '#fff', fontSize: 26, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
  },
  btn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtn: { backgroundColor: '#ef4444' },
  acceptBtn: { backgroundColor: '#16a34a' },
});
