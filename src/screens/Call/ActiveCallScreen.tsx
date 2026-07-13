import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type CallDTO } from '../../lib/api';
import { getLiveKit, isLiveKitAvailable } from './liveKitClient';
import { supabase } from '../../lib/supabase';
import {
  CALL_VIDEO_TOPIC,
  decodeCallVideoSignal,
  encodeCallVideoSignal,
  type CallVideoSignal,
} from './callVideoSignaling';
import { useVideoCallNegotiation } from './useVideoCallNegotiation';
import { VideoRequestOverlay } from './VideoRequestOverlay';
import { AddCallParticipantModal } from '../../components/AddCallParticipantModal';
import { CallParticipantGrid } from './CallParticipantGrid';
import type { CallTileParticipant } from './callGridUtils';

type Params = {
  call: CallDTO;
  token: string | { token?: string } | Record<string, unknown>;
  url: string;
};

type RoomParams = {
  call: CallDTO;
  token: string;
  url: string;
  peerName: string;
  peerAvatar: string | null;
};

function useCallPeer(call: CallDTO | undefined, myAuthId: string | null) {
  const [peerName, setPeerName] = useState('Unknown');
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!call || !myAuthId) return;
    let alive = true;
    (async () => {
      try {
        if (call.scope === 'group' && call.group_id) {
          const { group } = await api.groups.get(call.group_id);
          if (!alive) return;
          const g = group as { name?: string; avatar_url?: string | null };
          setPeerName(g.name?.trim() || 'Group call');
          setPeerAvatar(g.avatar_url ?? null);
          return;
        }
        const targetAuth = call.caller_id === myAuthId ? call.callee_id : call.caller_id;
        if (!targetAuth) return;
        const { profile } = await api.profiles.getByUserId(targetAuth);
        if (!alive) return;
        const p = profile as {
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
        };
        setPeerName(p.display_name?.trim() || p.email?.split('@')[0] || 'Unknown');
        setPeerAvatar(p.avatar_url ?? null);
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      alive = false;
    };
  }, [call, myAuthId]);

  return { peerName, peerAvatar };
}

import { rootNavigationRef } from '../../navigation/rootNavigation';

function navigateBackSafely() {
  if (rootNavigationRef.isReady() && rootNavigationRef.canGoBack()) {
    rootNavigationRef.goBack();
    return;
  }
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('Main');
  }
}

function normalizeToken(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && 'token' in (input as Record<string, unknown>)) {
    const nested = (input as Record<string, unknown>).token;
    if (typeof nested === 'string') return nested;
  }
  return '';
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString();
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function ActiveCallScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const params = (route.params ?? {}) as Partial<Params>;
  const call = params.call;
  const token = normalizeToken(params.token);
  const url = params.url;
  const [myAuthId, setMyAuthId] = useState<string | null>(null);
  const [latestCall, setLatestCall] = useState<CallDTO | null>(call ?? null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyAuthId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!call?.id) return;
    let mounted = true;
    const poll = async () => {
      try {
        const { call: refreshed } = await api.calls.get(call.id);
        if (mounted) setLatestCall(refreshed as CallDTO);
      } catch {
        /* ignore transient errors */
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 1800);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [call?.id]);

  const available = isLiveKitAvailable();
  const effectiveCall = latestCall ?? call;
  const { peerName, peerAvatar } = useCallPeer(effectiveCall, myAuthId);
  const isCallerWaitingForAccept =
    !!effectiveCall &&
    !!myAuthId &&
    effectiveCall.caller_id === myAuthId &&
    effectiveCall.status === 'ringing';
  const callTerminatedBeforeConnect =
    effectiveCall &&
    ['declined', 'missed', 'cancelled', 'ended'].includes(effectiveCall.status);

  if (!effectiveCall || !token || !url) {
    return <FallbackError message="Missing call parameters" />;
  }
  if (callTerminatedBeforeConnect) {
    return <FallbackError message={`Call ${effectiveCall.status}.`} />;
  }
  if (isCallerWaitingForAccept) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 80 }]}>
        <StatusBar barStyle="light-content" />
        <Ionicons name="call-outline" size={52} color="#fff" />
        <Text style={styles.errorText}>Ringing... waiting for receiver to accept</Text>
      </View>
    );
  }
  if (Platform.OS === 'web') {
    return (
      <WebCallRoom
        call={effectiveCall}
        token={token}
        url={url}
        peerName={peerName}
        peerAvatar={peerAvatar}
      />
    );
  }
  if (!available) {
    return (
      <FallbackError
        message="LiveKit native module not loaded. Run `npx expo prebuild` and rebuild the app to enable calls."
      />
    );
  }

  return (
    <CallRoom
      call={effectiveCall}
      token={token}
      url={url}
      peerName={peerName}
      peerAvatar={peerAvatar}
    />
  );
}

function WebCallRoom({ call, token, url, peerName, peerAvatar }: RoomParams) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const startedAsVideo = call.call_type === 'video';
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [callEnded, setCallEnded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting'>(
    'connecting'
  );
  const roomRef = React.useRef<any>(null);
  const remoteVideoRef = React.useRef<any>(null);
  const localVideoRef = React.useRef<any>(null);
  const localVideoTrackRef = React.useRef<any>(null);
  const remoteVideoTrackRef = React.useRef<any>(null);
  const handleSignalRef = React.useRef<(signal: CallVideoSignal) => void>(() => undefined);

  const publishSignal = React.useCallback((signal: CallVideoSignal) => {
    const room = roomRef.current;
    room?.localParticipant?.publishData?.(encodeCallVideoSignal(signal), {
      reliable: true,
      topic: CALL_VIDEO_TOPIC,
    });
  }, []);

  const enableLocalVideo = React.useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(true);
    const camPub = room.localParticipant.getTrackPublication?.(
      (await import('livekit-client')).Track.Source.Camera
    );
    const track = camPub?.track;
    if (track && localVideoRef.current) {
      localVideoTrackRef.current = track;
      track.attach(localVideoRef.current);
    }
  }, []);

  const disableLocalVideo = React.useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(false);
    try {
      localVideoTrackRef.current?.detach?.();
    } catch {
      /* ignore */
    }
    localVideoTrackRef.current = null;
  }, []);

  const setCameraEnabled = React.useCallback(async (enabled: boolean) => {
    await roomRef.current?.localParticipant?.setCameraEnabled?.(enabled);
  }, []);

  const negotiation = useVideoCallNegotiation({
    peerName,
    startedAsVideo,
    publishSignal,
    enableLocalVideo,
    disableLocalVideo,
    setCameraEnabled,
  });

  handleSignalRef.current = negotiation.handleSignal;
  const { sharedVideo, videoEnabled, outgoingRequest, incomingRequest } = negotiation;

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setDuration(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const lk = await import('livekit-client');
        const room = new lk.Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        room.on(lk.RoomEvent.DataReceived, (...args: unknown[]) => {
          const [payload, participant, , topic] = args;
          if ((participant as { isLocal?: boolean } | undefined)?.isLocal) return;
          if (topic && topic !== CALL_VIDEO_TOPIC) return;
          const bytes =
            payload instanceof Uint8Array ? payload : new Uint8Array(payload as ArrayBuffer);
          const signal = decodeCallVideoSignal(bytes);
          if (signal) handleSignalRef.current(signal);
        });

        room.on(lk.RoomEvent.Connected, () => {
          if (!mounted) return;
          setConnected(true);
          setConnectionState('connected');
        });
        room.on(lk.RoomEvent.Reconnecting, () => {
          if (!mounted) return;
          setConnectionState('reconnecting');
        });
        room.on(lk.RoomEvent.Reconnected, () => {
          if (!mounted) return;
          setConnectionState('connected');
        });

        room.on(lk.RoomEvent.TrackSubscribed, (track: any) => {
          if (track?.kind === 'video' && remoteVideoRef.current) {
            remoteVideoTrackRef.current = track;
            track.attach(remoteVideoRef.current);
          }
          if (track?.kind === 'audio') {
            track.attach();
          }
        });

        room.on(lk.RoomEvent.TrackUnsubscribed, (track: any) => {
          try {
            track?.detach?.();
          } catch {
            /* ignore */
          }
          if (remoteVideoTrackRef.current === track) remoteVideoTrackRef.current = null;
        });

        room.on(lk.RoomEvent.Disconnected, () => {
          if (!mounted) return;
          // If user intentionally ended call, we already navigate away.
          if (callEnded) return;
          navigateBackSafely();
        });

        await room.connect(url, token);
        await room.localParticipant.setMicrophoneEnabled(true);

        if (startedAsVideo) {
          try {
            await enableLocalVideo();
          } catch (camErr) {
            console.warn('[call] camera enable failed:', camErr);
            Alert.alert(
              'Camera',
              'Could not start the camera. You are still connected — check browser camera permissions and try the video button.'
            );
          }
        }
      } catch (err) {
        Alert.alert('Call error', err instanceof Error ? err.message : 'Failed to connect call');
        navigateBackSafely();
      }
    })();

    return () => {
      mounted = false;
      try {
        remoteVideoTrackRef.current?.detach?.();
      } catch {
        /* ignore */
      }
      try {
        localVideoTrackRef.current?.detach?.();
        localVideoTrackRef.current?.stop?.();
      } catch {
        /* ignore */
      }
      roomRef.current?.disconnect?.();
    };
  }, [callEnded, enableLocalVideo, navigation, startedAsVideo, token, url]);

  const finishCall = async () => {
    if (callEnded) return;
    setCallEnded(true);
    try {
      await api.calls.end(call.id);
    } catch {
      /* ignore */
    }
    roomRef.current?.disconnect?.();
    navigateBackSafely();
  };

  const toggleMute = async () => {
    const next = !muted;
    try {
      await roomRef.current?.localParticipant?.setMicrophoneEnabled?.(!next);
      setMuted(next);
    } catch {
      /* ignore */
    }
  };

  const toggleVideo = () => {
    void negotiation.toggleVideo();
  };

  const VideoEl = 'video' as any;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.webBadgeWrap}>
        <View style={styles.webBetaBadge}>
          <Text style={styles.webBetaText}>Web beta</Text>
        </View>
      </View>
      {connectionState !== 'connected' && (
        <View style={styles.webConnectionBanner}>
          <Ionicons name="sync-outline" size={14} color="#fff" />
          <Text style={styles.webConnectionText}>
            {connectionState === 'reconnecting' ? 'Reconnecting...' : 'Connecting...'}
          </Text>
        </View>
      )}
      <View style={styles.roomBody}>
        <VideoRequestOverlay
          peerName={peerName}
          incomingVisible={incomingRequest}
          outgoingVisible={outgoingRequest}
          onAccept={() => void negotiation.acceptIncomingVideo()}
          onDecline={negotiation.declineIncomingVideo}
        />
        <View style={styles.remoteWrap}>
          {sharedVideo ? (
            <VideoEl
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <View style={styles.audioOnly}>
              {peerAvatar ? (
                <Image source={{ uri: peerAvatar }} style={styles.callAvatar} />
              ) : (
                <View style={[styles.callAvatar, styles.callAvatarFallback]}>
                  <Text style={styles.callAvatarFallbackText}>
                    {peerName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.peerCallName}>{peerName}</Text>
              <Text style={styles.statusText}>
                {outgoingRequest
                  ? 'Video request sent…'
                  : connected
                    ? 'On call'
                    : 'Connecting...'}
              </Text>
            </View>
          )}

          {sharedVideo && videoEnabled && (
            <View style={styles.pip}>
              <VideoEl
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </View>
          )}
        </View>

        <View style={styles.bar}>
          <Text style={styles.duration}>{formatDuration(duration)}</Text>
        </View>

        <View style={[styles.controls, { paddingBottom: 32 + insets.bottom }]}>
          <TouchableOpacity style={[styles.ctrlBtn, muted && styles.ctrlBtnActive]} onPress={toggleMute}>
            <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctrlBtn, sharedVideo && !videoEnabled && styles.ctrlBtnActive]}
            onPress={toggleVideo}
          >
            <Ionicons
              name={sharedVideo && videoEnabled ? 'videocam' : 'videocam-off'}
              size={26}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ctrlBtn, styles.endBtn]} onPress={finishCall}>
            <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function FallbackError({ message }: { message: string }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 80 }]}>
      <StatusBar barStyle="light-content" />
      <Ionicons name="alert-circle-outline" size={48} color="#fff" />
      <Text style={styles.errorText}>{message}</Text>
      <TouchableOpacity style={styles.endBtn} onPress={() => navigateBackSafely()}>
        <Ionicons name="close" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

/**
 * The LiveKit room is wrapped in its own component so that React's lazy
 * require in `getLiveKit()` doesn't run on devices that lack the native
 * module.
 */
function CallRoom({ call, token, url, peerName, peerAvatar }: RoomParams) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [callEnded, setCallEnded] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [myAuthId, setMyAuthId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyAuthId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setDuration(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Lazy-required LiveKit React hooks/components
  const lk = useMemo(() => getLiveKit(), []);
  if (!lk) {
    return <FallbackError message="LiveKit failed to load" />;
  }

  const {
    LiveKitRoom,
    useTracks,
    VideoTrack,
    AudioSession,
    Track,
    useLocalParticipant,
    useRoomContext,
  } = lk as unknown as {
    LiveKitRoom: React.ComponentType<{
      serverUrl: string;
      token: string;
      audio?: boolean;
      video?: boolean;
      onConnected?: () => void;
      onDisconnected?: () => void;
      onError?: (e: Error) => void;
      children?: React.ReactNode;
    }>;
    useTracks: (kinds?: unknown[]) => Array<{
      participant: { identity: string; isLocal: boolean };
      publication?: { trackSid?: string };
      source: unknown;
    }>;
    VideoTrack: React.ComponentType<{ trackRef: unknown; style?: unknown }>;
    AudioSession: { startAudioSession: () => Promise<void>; stopAudioSession: () => Promise<void> };
    Track: { Source: { Camera: unknown; Microphone: unknown; ScreenShare: unknown } };
    useLocalParticipant: () => {
      localParticipant: {
        setMicrophoneEnabled: (b: boolean) => Promise<void>;
        setCameraEnabled: (b: boolean) => Promise<void>;
      };
    };
    useRoomContext: () => { disconnect: () => Promise<void> };
  };

  useEffect(() => {
    if (Platform.OS !== 'web') {
      AudioSession?.startAudioSession?.().catch(() => undefined);
    }
    return () => {
      if (Platform.OS !== 'web') {
        AudioSession?.stopAudioSession?.().catch(() => undefined);
      }
    };
  }, [AudioSession]);

  const finishCall = async (markEnded = true) => {
    if (callEnded) return;
    setCallEnded(true);
    try {
      if (markEnded) await api.calls.end(call.id);
    } catch {
      /* ignore */
    }
    navigateBackSafely();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <AddCallParticipantModal
        visible={showAddParticipant}
        call={call}
        onClose={() => setShowAddParticipant(false)}
        onInvited={() => undefined}
      />
      <LiveKitRoom
        serverUrl={url}
        token={token}
        audio
        video
        onConnected={() => undefined}
        onDisconnected={() => finishCall(false)}
        onError={(err: Error) => {
          Alert.alert('Call error', err.message);
          finishCall(false);
        }}
      >
        <RoomBody
          call={call}
          myAuthId={myAuthId}
          callType={call.call_type}
          peerName={peerName}
          peerAvatar={peerAvatar}
          duration={duration}
          muted={muted}
          onToggleMute={async () => {
            setMuted((m) => !m);
          }}
          onEnd={() => finishCall(true)}
          onAddParticipant={() => setShowAddParticipant(true)}
          useTracks={useTracks}
          VideoTrack={VideoTrack}
          Track={Track}
          useLocalParticipant={useLocalParticipant}
          useRoomContext={useRoomContext}
        />
      </LiveKitRoom>
    </View>
  );
}

function RoomBody(props: {
  call: CallDTO;
  myAuthId: string | null;
  callType: 'voice' | 'video';
  peerName: string;
  peerAvatar: string | null;
  duration: number;
  muted: boolean;
  onToggleMute: () => Promise<void>;
  onEnd: () => void;
  onAddParticipant: () => void;
  useTracks: (kinds?: unknown[]) => Array<{
    participant: { identity: string; isLocal: boolean };
    publication?: { trackSid?: string };
    source: unknown;
  }>;
  VideoTrack: React.ComponentType<{ trackRef: unknown; style?: unknown }>;
  Track: { Source: { Camera: unknown; Microphone: unknown; ScreenShare: unknown } };
  useLocalParticipant: () => {
    localParticipant: {
      setMicrophoneEnabled: (b: boolean) => Promise<void>;
      setCameraEnabled: (b: boolean) => Promise<void>;
      publishData?: (data: Uint8Array, opts: { reliable: boolean; topic: string }) => void;
    };
  };
  useRoomContext: () => { disconnect: () => Promise<void> };
}) {
  const { useTracks, VideoTrack, Track, useLocalParticipant, useRoomContext } = props;
  const insets = useSafeAreaInsets();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const startedAsVideo = props.callType === 'video';
  const handleSignalRef = React.useRef<(signal: CallVideoSignal) => void>(() => undefined);
  const [participantProfiles, setParticipantProfiles] = useState<
    Map<string, { display_name: string; avatar_url: string | null }>
  >(new Map());

  useEffect(() => {
    if (!props.call.id) return;
    let alive = true;
    const load = async () => {
      try {
        const { participants } = await api.calls.participants(props.call.id);
        if (!alive) return;
        const map = new Map<string, { display_name: string; avatar_url: string | null }>();
        participants.forEach((p) => {
          map.set(p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url });
        });
        setParticipantProfiles(map);
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [props.call.id]);

  const publishSignal = React.useCallback(
    (signal: CallVideoSignal) => {
      localParticipant.publishData?.(encodeCallVideoSignal(signal), {
        reliable: true,
        topic: CALL_VIDEO_TOPIC,
      });
    },
    [localParticipant]
  );

  const enableLocalVideo = React.useCallback(async () => {
    await localParticipant.setCameraEnabled(true);
  }, [localParticipant]);

  const disableLocalVideo = React.useCallback(async () => {
    await localParticipant.setCameraEnabled(false);
  }, [localParticipant]);

  const setCameraEnabled = React.useCallback(
    async (enabled: boolean) => {
      await localParticipant.setCameraEnabled(enabled);
    },
    [localParticipant]
  );

  const negotiation = useVideoCallNegotiation({
    peerName: props.peerName,
    startedAsVideo,
    publishSignal,
    enableLocalVideo,
    disableLocalVideo,
    setCameraEnabled,
  });

  handleSignalRef.current = negotiation.handleSignal;
  const { sharedVideo, videoEnabled, outgoingRequest, incomingRequest } = negotiation;

  useEffect(() => {
    if (startedAsVideo && !sharedVideo) return;
    if (startedAsVideo) return;
    if (!sharedVideo) {
      void localParticipant.setCameraEnabled(false);
    }
  }, [localParticipant, sharedVideo, startedAsVideo]);

  useEffect(() => {
    const roomAny = room as {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      off?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    if (!roomAny?.on) return;

    const onData = (...args: unknown[]) => {
      const [payload, participant, , topic] = args;
      if ((participant as { isLocal?: boolean } | undefined)?.isLocal) return;
      if (topic && topic !== CALL_VIDEO_TOPIC) return;
      let bytes: Uint8Array;
      if (payload instanceof Uint8Array) bytes = payload;
      else if (payload instanceof ArrayBuffer) bytes = new Uint8Array(payload);
      else return;
      const signal = decodeCallVideoSignal(bytes);
      if (signal) handleSignalRef.current(signal);
    };

    roomAny.on('dataReceived', onData);
    return () => roomAny.off?.('dataReceived', onData);
  }, [room]);

  const cameraTracks = useTracks([Track.Source.Camera]);
  const remoteTracks = cameraTracks.filter((t) => !t.participant.isLocal);
  const localVideo = cameraTracks.find((t) => t.participant.isLocal);
  const remoteVideo = remoteTracks[0];

  const joinedCount = Math.max(participantProfiles.size, remoteTracks.length + 1);
  const isMultiParty =
    props.call.scope === 'group' ||
    Boolean((props.call.metadata as { multi_party?: boolean } | null)?.multi_party) ||
    joinedCount > 2;

  const gridParticipants: CallTileParticipant[] = React.useMemo(() => {
    if (!isMultiParty) return [];
    const tiles: CallTileParticipant[] = [];
    const trackByIdentity = new Map(
      cameraTracks.map((t) => [t.participant.identity, t])
    );
    for (const [uid, prof] of participantProfiles) {
      if (uid === props.myAuthId) continue;
      const track = trackByIdentity.get(uid);
      tiles.push({
        identity: uid,
        name: prof.display_name,
        avatarUrl: prof.avatar_url,
        hasVideo: sharedVideo && !!track,
      });
    }
    if (props.myAuthId && sharedVideo && videoEnabled) {
      tiles.push({
        identity: props.myAuthId,
        name: 'You',
        avatarUrl: null,
        isLocal: true,
        hasVideo: !!localVideo,
      });
    }
    return tiles.length > 0 ? tiles : [
      {
        identity: 'peer',
        name: props.peerName,
        avatarUrl: props.peerAvatar,
        hasVideo: sharedVideo && !!remoteVideo,
      },
    ];
  }, [
    isMultiParty,
    participantProfiles,
    cameraTracks,
    props.myAuthId,
    props.peerName,
    props.peerAvatar,
    sharedVideo,
    videoEnabled,
    localVideo,
    remoteVideo,
  ]);

  const toggleMute = async () => {
    await localParticipant.setMicrophoneEnabled(props.muted /* will become unmuted */);
    await props.onToggleMute();
  };

  const toggleVideo = () => {
    void negotiation.toggleVideo();
  };

  const hangup = async () => {
    try {
      await room.disconnect();
    } finally {
      props.onEnd();
    }
  };

  return (
    <View style={styles.roomBody}>
      <VideoRequestOverlay
        peerName={props.peerName}
        incomingVisible={incomingRequest}
        outgoingVisible={outgoingRequest}
        onAccept={() => void negotiation.acceptIncomingVideo()}
        onDecline={negotiation.declineIncomingVideo}
      />
      <View style={styles.remoteWrap}>
        {isMultiParty ? (
          <CallParticipantGrid
            participants={gridParticipants}
            renderVideo={(p, style) => {
              const track = cameraTracks.find((t) => t.participant.identity === p.identity);
              return track ? <VideoTrack trackRef={track} style={style} /> : null;
            }}
          />
        ) : sharedVideo && remoteVideo ? (
          <VideoTrack trackRef={remoteVideo} style={styles.remoteVideo} />
        ) : (
          <View style={styles.audioOnly}>
            {props.peerAvatar ? (
              <Image source={{ uri: props.peerAvatar }} style={styles.callAvatar} />
            ) : (
              <View style={[styles.callAvatar, styles.callAvatarFallback]}>
                <Text style={styles.callAvatarFallbackText}>
                  {props.peerName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.peerCallName}>{props.peerName}</Text>
            <Text style={styles.statusText}>
              {sharedVideo ? 'Connecting…' : isMultiParty ? 'Group call' : 'On call'}
            </Text>
            {sharedVideo && !startedAsVideo && videoEnabled && (
              <Text style={styles.revertHint}>Tap camera to switch back to voice</Text>
            )}
          </View>
        )}

        {!isMultiParty && sharedVideo && localVideo && videoEnabled && (
          <View style={styles.pip}>
            <VideoTrack trackRef={localVideo} style={styles.pipVideo} />
          </View>
        )}
      </View>

      <View style={styles.bar}>
        <Text style={styles.duration}>{formatDuration(props.duration)}</Text>
      </View>

      <View style={[styles.controls, { paddingBottom: 32 + insets.bottom }]}>
        <TouchableOpacity
          style={[styles.ctrlBtn, props.muted && styles.ctrlBtnActive]}
          onPress={toggleMute}
        >
          <Ionicons name={props.muted ? 'mic-off' : 'mic'} size={26} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ctrlBtn, sharedVideo && !videoEnabled && styles.ctrlBtnActive]}
          onPress={toggleVideo}
        >
          <Ionicons
            name={sharedVideo && videoEnabled ? 'videocam' : 'videocam-off'}
            size={26}
            color="#fff"
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrlBtn} onPress={props.onAddParticipant}>
          <Ionicons name="person-add" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, styles.endBtn]} onPress={hangup}>
          <Ionicons
            name="call"
            size={26}
            color="#fff"
            style={{ transform: [{ rotate: '135deg' }] }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  roomBody: { flex: 1, justifyContent: 'space-between' },
  remoteWrap: { flex: 1, position: 'relative', backgroundColor: '#0a0a0a' },
  remoteVideo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  audioOnly: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  callAvatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 12 },
  callAvatarFallback: {
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callAvatarFallbackText: { color: '#fff', fontSize: 46, fontWeight: '700' },
  peerCallName: { color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: 6 },
  statusText: { color: '#ccc', fontSize: 16, marginTop: 4 },
  revertHint: { color: '#888', fontSize: 12, marginTop: 8, textAlign: 'center' },
  pip: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 110,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fff',
  },
  pipVideo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bar: { paddingVertical: 12, alignItems: 'center' },
  duration: { color: '#aaa', fontSize: 14 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 32,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  ctrlBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctrlBtnActive: { backgroundColor: '#1976d2' },
  endBtn: { backgroundColor: '#ef4444' },
  errorText: { color: '#fff', textAlign: 'center', paddingHorizontal: 32, marginTop: 16 },
  webBadgeWrap: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 20,
  },
  webBetaBadge: {
    backgroundColor: 'rgba(14,165,233,0.85)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  webBetaText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  webConnectionBanner: {
    position: 'absolute',
    top: 10,
    left: 12,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  webConnectionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
