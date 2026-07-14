import React, { useEffect, useMemo, useState } from 'react';
import { Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallRingtone } from '../../hooks/useCallRingtone';
import { replaceWithActiveCall } from '../../navigation/rootNavigation';
import { leaveCallScreen } from '../../navigation/callSessionNav';
import { showAppToast } from '../../lib/appToast';
import { api, type CallDTO } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { fetchCallPeerInfo } from './callPeerInfo';

type Params = {
  call: CallDTO;
  token: string;
  url: string;
};

const RING_TIMEOUT_SEC = 60;

function navigateBackSafely() {
  leaveCallScreen('Calls');
}

export default function OutgoingCallScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = (route.params ?? {}) as Partial<Params>;
  const [call, setCall] = useState<CallDTO | null>((params.call as CallDTO) ?? null);
  const myAuthId = user?.id ?? null;
  const [peerName, setPeerName] = useState<string>('Calling...');
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const token = typeof params.token === 'string' ? params.token : '';
  const url = typeof params.url === 'string' ? params.url : '';

  const ringActive =
    Boolean(call?.id) &&
    call?.status === 'ringing' &&
    Boolean(token) &&
    Boolean(url);
  useCallRingtone(ringActive ? 'outgoing' : null);

  useEffect(() => {
    if (!call?.id) return;
    let mounted = true;

    const poll = async () => {
      try {
        const { call: latest } = await api.calls.get(call.id);
        if (!mounted) return;
        const next = latest as CallDTO;
        setCall(next);

        if (next.status === 'accepted') {
          replaceWithActiveCall({ call: next, token, url });
          return;
        }
        if (['declined', 'missed', 'cancelled', 'ended'].includes(next.status)) {
          showAppToast(
            next.status === 'declined'
              ? 'Call declined'
              : next.status === 'missed'
                ? 'No answer'
                : next.status === 'cancelled'
                  ? 'Call cancelled'
                  : 'Call ended'
          );
          navigateBackSafely();
        }
      } catch {
        /* transient, keep polling */
      }
    };

    void poll();
    const t = setInterval(() => void poll(), 1500);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [call?.id, navigation, token, url]);

  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!call?.id) return;
    // Ring timeout: if nobody accepts in 60s, mark missed and exit.
    if (elapsedSec < RING_TIMEOUT_SEC) return;
    (async () => {
      try {
        const { call: latest } = await api.calls.get(call.id);
        const c = latest as CallDTO;
        if (c.status === 'ringing') {
          await api.calls.noAnswer(c.id);
          showAppToast('No answer');
          navigateBackSafely();
        }
      } catch {
        /* ignore */
      }
    })();
  }, [elapsedSec, call?.id]);

  useEffect(() => {
    if (!call) return;
    let alive = true;
    (async () => {
      // Outgoing: for direct calls the peer is always the callee — don’t wait on auth.
      const info = await fetchCallPeerInfo(call, myAuthId);
      if (!alive) return;
      setPeerName(info.peerName);
      setPeerAvatar(info.peerAvatar);
    })();
    return () => {
      alive = false;
    };
  }, [call, myAuthId]);

  const title = useMemo(() => {
    if (!call) return 'Calling...';
    return call.scope === 'group' ? 'Calling group...' : 'Calling...';
  }, [call]);

  const cancel = async () => {
    if (call?.id) {
      try {
        await api.calls.end(call.id);
      } catch {
        /* ignore */
      }
    }
    leaveCallScreen('Calls', 'Call cancelled');
  };

  if (!call || !token || !url) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <StatusBar barStyle="light-content" />
        <Ionicons name="alert-circle-outline" size={48} color="#fff" />
        <Text style={styles.subtitle}>Missing call parameters</Text>
      </View>
    );
  }

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
          <Text style={styles.avatarFallbackText}>{peerName.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <Ionicons name={call.call_type === 'video' ? 'videocam-outline' : 'call-outline'} size={60} color="#fff" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.peerName}>{peerName}</Text>
      <Text style={styles.subtitle}>
        Waiting for receiver to accept ({Math.max(0, RING_TIMEOUT_SEC - elapsedSec)}s)
      </Text>

      <TouchableOpacity style={styles.endBtn} onPress={cancel}>
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
