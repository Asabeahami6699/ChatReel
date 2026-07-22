import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type CallDTO } from '../../lib/api';
import { getLiveKit, isLiveKitAvailable } from './liveKitClient';
import { CALL_EXTRAS_TOPIC, type CallExtrasSignal } from './callExtrasSignaling';
import { CallInCallChat } from './CallInCallChat';
import { CallReactionsBar } from './CallReactionsBar';
import { useCallExtras } from './useCallExtras';
import { CALL_VIDEO_TOPIC, decodeCallVideoSignal, encodeCallVideoSignal, type CallVideoSignal } from './callVideoSignaling';
import { useVideoCallNegotiation } from './useVideoCallNegotiation';
import { VideoRequestOverlay } from './VideoRequestOverlay';
import { AddCallParticipantModal } from '../../components/AddCallParticipantModal';
import { CallParticipantGrid } from './CallParticipantGrid';
import type { CallTileParticipant } from './callGridUtils';
import {
  connQualityLabel,
  flipLocalCameraFacing,
  normalizeConnQuality,
  setCallSpeakerOn,
  type CallConnQuality,
  type FacingMode,
} from './callMediaControls';
import { fetchCallPeerInfo, resolveCallPeerAuthId } from './callPeerInfo';
import { useAuth } from '../../hooks/useAuth';
import { useCallRowSync } from '../../hooks/useCallRowSync';
import { useCallRingtone } from '../../hooks/useCallRingtone';
import { useCallScreenMessageAlerts } from '../../hooks/useCallScreenMessageAlerts';
import { useRealtimeTopic } from '../../hooks/useRealtimeTopic';
import { leaveCallScreen } from '../../navigation/callSessionNav';
import { playCallEndTone, preloadCallEndTone } from '../../lib/playCallEndTone';
import { showAppToast } from '../../lib/appToast';
import { confirmAction, showErrorAlert } from '../../lib/confirmAction';
import { confirmToast } from '../../lib/confirmToast';
import {
  clearCallPip,
  getCallPipSnapshot,
  registerCallPipHandlers,
  updateCallPip,
} from './callPipBridge';
import { CallGiftSheet } from './CallGiftSheet';
import { beginCallHoldDisconnect, consumeCallHoldDisconnect } from './callHoldIntent';
import {
  clearHeldCallSession,
  getHeldCallSession,
  setHeldCallSession,
  subscribeHeldCallSession,
  type HeldCallSession,
} from './callHeldSession';
import { replaceWithActiveCall } from '../../navigation/rootNavigation';

type Params = {
  call: CallDTO;
  token: string | { token?: string } | Record<string, unknown>;
  url: string;
};

type ActiveCallScreenProps = {
  /** Rendered from ActiveCallLayer (outside the stack). */
  embedded?: boolean;
  call?: CallDTO;
  token?: string | { token?: string } | Record<string, unknown>;
  url?: string;
  /** Layer-driven PiP — keep LiveKit mounted; only chrome hides. */
  layerMinimized?: boolean;
};

type RoomParams = {
  call: CallDTO;
  token: string;
  url: string;
  peerName: string;
  peerAvatar: string | null;
  ringing?: boolean;
  layerMinimized?: boolean;
};

function useCallPeer(call: CallDTO | undefined, myAuthId: string | null) {
  const [peerName, setPeerName] = useState('Contact');
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!call) return;
    let alive = true;
    (async () => {
      const info = await fetchCallPeerInfo(call, myAuthId);
      if (!alive) return;
      setPeerName(info.peerName);
      setPeerAvatar(info.peerAvatar);
    })();
    return () => {
      alive = false;
    };
  }, [call, myAuthId]);

  return { peerName, peerAvatar };
}

function navigateBackSafely(toastMessage = 'Call ended') {
  leaveCallScreen('Calls', toastMessage);
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

function CallMsgBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.msgBadge}>
      <Text style={styles.msgBadgeText}>{count > 9 ? '9+' : String(count)}</Text>
    </View>
  );
}

export default function ActiveCallScreen() {
  const route = useRoute<any>();
  const params = (route.params ?? {}) as Partial<Params>;
  return (
    <ActiveCallContent
      call={params.call}
      token={params.token}
      url={params.url}
    />
  );
}

/** In-call UI used by the stack screen and by ActiveCallLayer (no route required). */
export function ActiveCallContent(props: ActiveCallScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const call = props.call;
  const token = normalizeToken(props.token);
  const url = props.url;
  const myAuthId = user?.id ?? null;
  const [latestCall, setLatestCall] = useState<CallDTO | null>(call ?? null);

  useEffect(() => {
    if (call) setLatestCall(call);
  }, [call?.id, call?.status]);

  const available = isLiveKitAvailable();
  const effectiveCall = latestCall ?? call;
  const isCallerRinging =
    !!effectiveCall &&
    !!myAuthId &&
    effectiveCall.caller_id === myAuthId &&
    effectiveCall.status === 'ringing';

  useCallRowSync(call?.id, setLatestCall, true, {
    fastPollMs: isCallerRinging
      ? 1000
      : effectiveCall?.status === 'accepted'
        ? 4000
        : null,
  });
  useCallRingtone(isCallerRinging ? 'outgoing' : null);

  useEffect(() => {
    preloadCallEndTone();
  }, []);

  useEffect(() => {
    if (!latestCall) return;
    const snap = getCallPipSnapshot();
    if (snap.callId === latestCall.id) {
      updateCallPip({ call: latestCall });
    }
  }, [latestCall]);

  const { peerName, peerAvatar } = useCallPeer(effectiveCall, myAuthId);

  useEffect(() => {
    const snap = getCallPipSnapshot();
    if (!snap.active || snap.callId !== (effectiveCall?.id ?? null)) return;
    updateCallPip({ peerName, peerAvatar });
  }, [peerName, peerAvatar, effectiveCall?.id]);

  const callTerminatedBeforeConnect =
    effectiveCall &&
    ['declined', 'missed', 'cancelled', 'ended'].includes(effectiveCall.status);

  // Peer (or local) ended the call — leave automatically; no Close tap required.
  useEffect(() => {
    if (!callTerminatedBeforeConnect) return;
    playCallEndTone();
    clearCallPip();
    const t = setTimeout(() => leaveCallScreen('Calls', 'Call ended', { playEndTone: false }), 50);
    return () => clearTimeout(t);
  }, [callTerminatedBeforeConnect, effectiveCall?.status]);

  if (!effectiveCall || !token || !url) {
    return <FallbackError message="Missing call parameters" />;
  }
  if (callTerminatedBeforeConnect) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 80 }]}>
        <StatusBar barStyle="light-content" />
        <Ionicons name="call-outline" size={48} color="#fff" />
        <Text style={styles.errorText}>Call ended</Text>
      </View>
    );
  }
  // Connect LiveKit while still ringing so caller is in the room before
  // callee accepts — both sides meet as soon as accept lands.
  if (Platform.OS === 'web') {
    return (
      <WebCallRoom
        call={effectiveCall}
        token={token}
        url={url}
        peerName={peerName}
        peerAvatar={peerAvatar}
        ringing={isCallerRinging}
        layerMinimized={Boolean(props.layerMinimized)}
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
      ringing={isCallerRinging}
      layerMinimized={Boolean(props.layerMinimized)}
    />
  );
}

function WebCallRoom({
  call,
  token,
  url,
  peerName,
  peerAvatar,
  ringing = false,
  layerMinimized = false,
}: RoomParams) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const startedAsVideo = call.call_type === 'video';
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [callEnded, setCallEnded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting'>(
    'connecting'
  );
  const [connQuality, setConnQuality] = useState<CallConnQuality>('unknown');
  const [pipSwapped, setPipSwapped] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [sharingScreen, setSharingScreen] = useState(false);
  const [minimized, setMinimized] = useState(layerMinimized);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftBalance, setGiftBalance] = useState(0);
  const [heldSession, setHeldSession] = useState<HeldCallSession | null>(getHeldCallSession);
  const roomRef = React.useRef<any>(null);
  const remoteVideoRef = React.useRef<any>(null);
  const localVideoRef = React.useRef<any>(null);
  const localVideoTrackRef = React.useRef<any>(null);
  const remoteVideoTrackRef = React.useRef<any>(null);
  const handleSignalRef = React.useRef<(signal: CallVideoSignal) => void>(() => undefined);
  const extrasHandleRef = React.useRef<(bytes: Uint8Array) => void>(() => undefined);
  const peerAuthId = resolveCallPeerAuthId(call, user?.id ?? null);

  const extras = useCallExtras('You');
  extrasHandleRef.current = (bytes) => extras.handleExtrasPayload(bytes, false);
  const msgAlerts = useCallScreenMessageAlerts({
    myAuthId: user?.id ?? null,
    enabled: !callEnded,
  });
  const messageBadge = extras.unreadChatCount + msgAlerts.unreadCount;

  useEffect(() => subscribeHeldCallSession(setHeldSession), []);

  const switchToHeld = async () => {
    const held = getHeldCallSession();
    if (!held) return;
    beginCallHoldDisconnect();
    try {
      const { held_call, call: next, live_kit } = await api.calls.switchTo(call.id, held.call.id);
      setHeldCallSession({ call: held_call, peerName });
      replaceWithActiveCall({
        call: next,
        token: live_kit.token,
        url: live_kit.url,
      });
      showAppToast('Switched call');
    } catch (err) {
      showErrorAlert(
        'Switch',
        err instanceof Error ? err.message : 'Could not switch calls'
      );
    }
  };

  const publishSignal = React.useCallback((signal: CallVideoSignal) => {
    const room = roomRef.current;
    room?.localParticipant?.publishData?.(encodeCallVideoSignal(signal), {
      reliable: true,
      topic: CALL_VIDEO_TOPIC,
    });
  }, []);

  const publishExtras = React.useCallback(
    (signal: CallExtrasSignal) => {
      const lp = roomRef.current?.localParticipant;
      if (!lp?.publishData) return;
      extras.publishExtras((data, opts) => lp.publishData(data, opts), signal);
    },
    [extras.publishExtras]
  );

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
    if (ringing) {
      setDuration(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setDuration(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [ringing]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const lk = await import('livekit-client');
        const room = new lk.Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        roomRef.current = room;

        room.on(lk.RoomEvent.DataReceived, (...args: unknown[]) => {
          const [payload, participant, , topic] = args;
          if ((participant as { isLocal?: boolean } | undefined)?.isLocal) return;
          const bytes =
            payload instanceof Uint8Array ? payload : new Uint8Array(payload as ArrayBuffer);
          if (topic === CALL_EXTRAS_TOPIC) {
            extrasHandleRef.current?.(bytes);
            return;
          }
          if (topic && topic !== CALL_VIDEO_TOPIC) return;
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
          void import('../../lib/callRowResyncBridge').then((m) =>
            m.requestCallRowResync(call.id)
          );
        });

        room.on(lk.RoomEvent.ConnectionQualityChanged, (quality: unknown, participant: any) => {
          if (!mounted) return;
          if (participant && !participant.isLocal) return;
          setConnQuality(normalizeConnQuality(quality));
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
          if (callEnded) return;
          if (consumeCallHoldDisconnect()) return;
          // Remount / chrome swap while floating must not hang up.
          const pip = getCallPipSnapshot();
          if (pip.minimized && pip.callId === call.id) return;
          void (async () => {
            try {
              await api.calls.end(call.id);
            } catch {
              /* ignore */
            }
            clearCallPip();
            leaveCallScreen('Calls', 'Call ended');
          })();
        });

        room.on(lk.RoomEvent.ParticipantDisconnected, () => {
          if (!mounted || callEnded) return;
          // Direct call: peer left LiveKit — wait briefly (PiP / reconnect) before ending.
          if (call.scope === 'direct') {
            const remotes = room.remoteParticipants?.size ?? 0;
            if (remotes === 0) {
              setTimeout(() => {
                if (!mounted || callEnded) return;
                const stillEmpty = (room.remoteParticipants?.size ?? 0) === 0;
                if (!stillEmpty) return;
                void (async () => {
                  try {
                    const { call: latest } = await api.calls.get(call.id);
                    if (['ended', 'cancelled', 'declined', 'missed'].includes(latest.status)) {
                      leaveCallScreen('Calls', 'Call ended');
                      return;
                    }
                    const { participants } = await api.calls.participants(call.id);
                    const other = participants.find((p) => p.user_id !== (user?.id ?? ''));
                    if (other?.state === 'held' || other?.state === 'joined') {
                      if (other.state === 'held') showAppToast('Other person put you on hold');
                      return;
                    }
                    await api.calls.end(call.id);
                  } catch {
                    /* ignore */
                  }
                  leaveCallScreen('Calls', 'Call ended');
                })();
              }, 1200);
            }
          }
        });

        await room.connect(url, token);
        await room.localParticipant.setMicrophoneEnabled(true);

        if (startedAsVideo) {
          try {
            await enableLocalVideo();
          } catch (camErr) {
            console.warn('[call] camera enable failed:', camErr);
            showAppToast('Could not start the camera — still connected. Check permissions.');
          }
        }
      } catch (err) {
        showAppToast(err instanceof Error ? err.message : 'Failed to connect call', {
          isError: true,
        });
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
  }, [callEnded, enableLocalVideo, startedAsVideo, token, url]);

  const finishCall = async () => {
    if (callEnded) return;
    if (consumeCallHoldDisconnect()) return;
    playCallEndTone();
    clearCallPip();
    const isGroup = call.scope === 'group';
    setCallEnded(true);
    const held = getHeldCallSession();
    try {
      await api.calls.end(call.id);
    } catch {
      /* ignore */
    }
    roomRef.current?.disconnect?.();
    if (held) {
      clearHeldCallSession();
      try {
        const { call: next, live_kit } = await api.calls.resume(held.call.id);
        replaceWithActiveCall({
          call: next,
          token: live_kit.token,
          url: live_kit.url,
        });
        showAppToast('Back to held call');
        return;
      } catch {
        clearHeldCallSession();
      }
    } else {
      clearHeldCallSession();
    }
    leaveCallScreen('Calls', isGroup ? 'Left the call' : 'Call ended', { playEndTone: false });
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

  const flipCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const lk = await import('livekit-client');
      const next = await flipLocalCameraFacing(
        room.localParticipant,
        lk.Track.Source.Camera,
        facingMode
      );
      if (next) {
        setFacingMode(next);
        if (localVideoRef.current) {
          const pub = room.localParticipant.getTrackPublication?.(lk.Track.Source.Camera);
          const track = pub?.track;
          if (track?.attach) {
            localVideoTrackRef.current = track;
            track.attach(localVideoRef.current);
          }
        }
      }
    } catch {
      /* ignore */
    }
  };

  const toggleScreenShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const next = !sharingScreen;
      await room.localParticipant.setScreenShareEnabled(next);
      setSharingScreen(next);
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Could not start screen sharing', {
        isError: true,
      });
    }
  };

  const qualityHint = connQualityLabel(connQuality);
  const VideoEl = 'video' as any;

  const setCallMinimized = (value: boolean) => {
    setMinimized(value);
    if (value) {
      registerCallPipHandlers({
        onExpand: () => {
          setMinimized(false);
          updateCallPip({ minimized: false, active: true });
        },
        onToggleMute: () => void toggleMute(),
        onEnd: () => void finishCall(),
      });
      updateCallPip({
        active: true,
        minimized: true,
        callId: call.id,
        call,
        token,
        url,
        peerName,
        peerAvatar,
        durationLabel: formatDuration(duration),
        elapsedSec: duration,
        muted,
      });
      if (sharedVideo && videoEnabled) {
        void negotiation.toggleVideo();
      }
    } else {
      updateCallPip({ minimized: false, active: true });
    }
  };

  useEffect(() => {
    setMinimized(layerMinimized);
  }, [layerMinimized]);

  useEffect(() => {
    if (!minimized) return;
    updateCallPip({
      callId: call.id,
      durationLabel: formatDuration(duration),
      muted,
      peerName,
      peerAvatar,
    });
  }, [minimized, duration, muted, peerName, peerAvatar, call.id]);

  useEffect(() => {
    return () => {
      // Remount during minimize must not wipe PiP handlers / callId fallback.
      if (!getCallPipSnapshot().minimized) clearCallPip();
    };
  }, []);

  useEffect(() => {
    if (minimized) return;
    try {
      if (remoteVideoTrackRef.current && remoteVideoRef.current) {
        remoteVideoTrackRef.current.attach(remoteVideoRef.current);
      }
      if (localVideoTrackRef.current && localVideoRef.current) {
        localVideoTrackRef.current.attach(localVideoRef.current);
      }
    } catch {
      /* ignore */
    }
  }, [minimized]);

  const weakTipShownRef = React.useRef(false);
  const autoAudioOnlyRef = React.useRef(false);
  useEffect(() => {
    if (connQuality !== 'poor' && connQuality !== 'lost') return;
    if (!weakTipShownRef.current) {
      weakTipShownRef.current = true;
      showAppToast('Weak connection — audio preferred for now');
    }
    if (autoAudioOnlyRef.current) return;
    if (!sharedVideo || !videoEnabled) return;
    autoAudioOnlyRef.current = true;
    void negotiation.toggleVideo();
    showAppToast('Switched to audio-only due to weak connection');
  }, [connQuality, negotiation, sharedVideo, videoEnabled]);

  const blockPeer = async () => {
    if (!peerAuthId) return;
    const ok = await confirmAction(`Block ${peerName}?`, 'They will no longer be able to call or message you.', 'Block');
    if (!ok) return;
    try {
      await api.friendships.block(peerAuthId);
      showAppToast(`${peerName} blocked`);
      await finishCall();
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Could not block user', { isError: true });
    }
  };

  const openCallMenu = () => {
    if (!peerAuthId || call.scope !== 'direct') return;
    void blockPeer();
  };

  const reelContextId =
    typeof (call.metadata as { reel_id?: unknown } | null)?.reel_id === 'string'
      ? (call.metadata as { reel_id: string }).reel_id
      : null;

  useEffect(() => {
    if (!extras.recordingRequestAt) return;
    let alive = true;
    void (async () => {
      const ok = await confirmToast({
        message: 'Host wants to record this call. Allow recording?',
        confirmLabel: 'Allow',
        cancelLabel: 'Decline',
        destructive: false,
      });
      if (!alive) return;
      publishExtras({ type: 'recording_consent', allowed: ok, at: Date.now() });
      extras.clearRecordingRequest();
      showAppToast(ok ? 'You allowed recording' : 'You declined recording');
    })();
    return () => {
      alive = false;
    };
  }, [extras.recordingRequestAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestRecording = async () => {
    const ok = await confirmToast({
      message: 'Ask everyone to consent before recording this call?',
      confirmLabel: 'Ask',
      cancelLabel: 'Cancel',
      destructive: false,
    });
    if (!ok) return;
    publishExtras({ type: 'recording_request', at: Date.now() });
    extras.setRecordingActive(true);
    showAppToast('Recording consent requested');
  };

  const openTipSheet = async () => {
    if (!peerAuthId) return;
    try {
      const bal = await api.wallet.balance();
      setGiftBalance(bal.balance_coins ?? 0);
    } catch {
      setGiftBalance(0);
    }
    setGiftOpen(true);
  };

  if (minimized) {
    // LiveKit keeps running here; FloatingCallOverlay shows the bubble on Main.
    return <View style={styles.minimizedRoot} pointerEvents="none" />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topChrome}>
        <TouchableOpacity
          style={styles.chromeBtn}
          onPress={() => setCallMinimized(true)}
          accessibilityLabel="Minimize call"
        >
          <Ionicons name="chevron-down" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.webBadgeWrapInline}>
          <View style={styles.webBetaBadge}>
            <Text style={styles.webBetaText}>Web beta</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.chromeBtn}
          onPress={() => void requestRecording()}
          accessibilityLabel="Request recording consent"
        >
          <Ionicons
            name={extras.recordingActive ? 'radio-button-on' : 'recording-outline'}
            size={20}
            color={extras.recordingActive ? '#ef4444' : '#fff'}
          />
        </TouchableOpacity>
        {call.scope === 'direct' && peerAuthId ? (
          <TouchableOpacity
            style={styles.chromeBtn}
            onPress={openCallMenu}
            accessibilityLabel="Call options"
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.chromeBtn} />
        )}
      </View>
      {heldSession ? (
        <TouchableOpacity style={styles.heldBanner} onPress={() => void switchToHeld()}>
          <Ionicons name="swap-horizontal" size={16} color="#fff" />
          <Text style={styles.heldBannerText} numberOfLines={1}>
            {heldSession.peerName ?? 'Call'} on hold — tap to switch
          </Text>
        </TouchableOpacity>
      ) : null}
      {reelContextId ? (
        <View style={styles.reelContextChip}>
          <Ionicons name="film-outline" size={14} color="#fff" />
          <Text style={styles.reelContextText}>About a reel</Text>
        </View>
      ) : null}
      {extras.recordingActive ? (
        <View style={styles.recordingBanner}>
          <Ionicons name="radio-button-on" size={12} color="#fff" />
          <Text style={styles.recordingText}>Recording consent active</Text>
        </View>
      ) : null}
      {extras.incomingGiftBurst ? (
        <View style={styles.giftBurst} pointerEvents="none">
          <Text style={styles.giftBurstEmoji}>{extras.incomingGiftBurst}</Text>
        </View>
      ) : null}
      {(connectionState !== 'connected' || qualityHint) && (
        <View style={styles.webConnectionBanner}>
          <Ionicons
            name={qualityHint ? 'cellular-outline' : 'sync-outline'}
            size={14}
            color="#fff"
          />
          <Text style={styles.webConnectionText}>
            {qualityHint
              ? qualityHint
              : connectionState === 'reconnecting'
                ? 'Reconnecting...'
                : 'Connecting...'}
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
            <>
              <View
                style={pipSwapped ? styles.pip : styles.fullBleed}
                pointerEvents={pipSwapped ? 'box-none' : 'none'}
              >
                <VideoEl
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  style={styles.mediaFill}
                />
                {pipSwapped ? (
                  <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    onPress={() => setPipSwapped(false)}
                  />
                ) : null}
              </View>
              {videoEnabled ? (
                <TouchableOpacity
                  style={pipSwapped ? styles.fullBleed : styles.pip}
                  activeOpacity={0.95}
                  onPress={() => setPipSwapped((s) => !s)}
                >
                  <VideoEl
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={styles.mediaFill}
                  />
                  {muted && !pipSwapped ? (
                    <View style={styles.pipMuteBadge}>
                      <Ionicons name="mic-off" size={12} color="#fff" />
                    </View>
                  ) : null}
                </TouchableOpacity>
              ) : null}
            </>
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
                {ringing
                  ? 'Ringing…'
                  : outgoingRequest
                    ? 'Video request sent…'
                    : connected
                      ? 'On call'
                      : 'Connecting...'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bar}>
          <Text style={styles.duration}>{formatDuration(duration)}</Text>
        </View>

        <CallReactionsBar
          myName="You"
          publish={publishExtras}
          incoming={extras.incomingReaction}
        />

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
          {sharedVideo && videoEnabled ? (
            <TouchableOpacity style={styles.ctrlBtn} onPress={() => void flipCamera()}>
              <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.ctrlBtn, sharingScreen && styles.ctrlBtnActive]}
            onPress={() => void toggleScreenShare()}
          >
            <Ionicons name="desktop-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => {
              extras.openChat();
              msgAlerts.clearUnread();
            }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={24} color="#fff" />
            <CallMsgBadge count={messageBadge} />
          </TouchableOpacity>
          {peerAuthId ? (
            <TouchableOpacity style={styles.ctrlBtn} onPress={() => void openTipSheet()}>
              <Ionicons name="gift-outline" size={24} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.endBtn]}
            onPress={finishCall}
            accessibilityLabel={call.scope === 'group' ? 'Leave call' : 'End call'}
          >
            <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>

        <CallInCallChat
          visible={extras.chatOpen}
          onClose={() => extras.closeChat()}
          myName="You"
          publish={publishExtras}
          messages={extras.messages}
          onLocalSend={extras.onLocalChat}
        />
        {peerAuthId ? (
          <CallGiftSheet
            visible={giftOpen}
            callId={call.id}
            recipientUserId={peerAuthId}
            recipientName={peerName}
            balanceCoins={giftBalance}
            onClose={() => setGiftOpen(false)}
            onSent={({ gift, balanceCoins }) => {
              setGiftBalance(balanceCoins);
              publishExtras({ type: 'gift', emoji: gift.emoji, at: Date.now() });
              showAppToast(`Sent ${gift.emoji} ${gift.name}`);
            }}
            onBuyCoins={() => {
              setGiftOpen(false);
              showAppToast('Buy coins from Creator Wallet in Reels');
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function FallbackError({ message }: { message: string }) {
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
function CallRoom({
  call,
  token,
  url,
  peerName,
  peerAvatar,
  ringing = false,
  layerMinimized = false,
}: RoomParams) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [callEnded, setCallEnded] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [minimized, setMinimized] = useState(layerMinimized);
  const myAuthId = user?.id ?? null;
  const peerAuthId = resolveCallPeerAuthId(call, myAuthId);

  useEffect(() => {
    if (ringing) {
      setDuration(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setDuration(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [ringing]);

  useEffect(() => {
    setMinimized(layerMinimized);
  }, [layerMinimized]);

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
    AudioSession: {
      startAudioSession: () => Promise<void>;
      stopAudioSession: () => Promise<void>;
      selectAudioOutput?: (id: string) => Promise<void>;
      getAudioOutputs?: () => Promise<string[]>;
      configureAudio?: (config: Record<string, unknown>) => Promise<void>;
    };
    Track: { Source: { Camera: unknown; Microphone: unknown; ScreenShare: unknown } };
    useLocalParticipant: () => {
      localParticipant: {
        setMicrophoneEnabled: (b: boolean) => Promise<void>;
        setCameraEnabled: (b: boolean) => Promise<void>;
      };
    };
    useRoomContext: () => { disconnect: () => Promise<void> };
  };

  if (!Track?.Source?.Camera) {
    return <FallbackError message="LiveKit Track.Source failed to load" />;
  }

  useEffect(() => {
    if (Platform.OS !== 'web') {
      void (async () => {
        try {
          await AudioSession?.startAudioSession?.();
          // Video defaults to speaker; voice to earpiece — user can toggle.
          await setCallSpeakerOn(AudioSession, call.call_type === 'video');
        } catch {
          /* ignore */
        }
      })();
    }
    return () => {
      if (Platform.OS !== 'web') {
        AudioSession?.stopAudioSession?.().catch(() => undefined);
      }
    };
  }, [AudioSession, call.call_type]);

  const finishCall = async (markEnded = true) => {
    if (callEnded) return;
    if (consumeCallHoldDisconnect()) {
      return;
    }
    playCallEndTone();
    clearCallPip();
    setCallEnded(true);
    const held = getHeldCallSession();
    try {
      await api.calls.end(call.id);
    } catch {
      /* ignore */
    }
    if (held) {
      clearHeldCallSession();
      try {
        const { call: next, live_kit } = await api.calls.resume(held.call.id);
        replaceWithActiveCall({
          call: next,
          token: live_kit.token,
          url: live_kit.url,
        });
        showAppToast('Back to held call');
        return;
      } catch {
        clearHeldCallSession();
      }
    } else {
      clearHeldCallSession();
    }
    if (!markEnded) {
      leaveCallScreen('Calls', 'Call ended', { playEndTone: false });
      return;
    }
    leaveCallScreen(
      'Calls',
      call.scope === 'group' ? 'Left the call' : 'Call ended',
      { playEndTone: false }
    );
  };

  const setCallMinimized = (value: boolean) => {
    setMinimized(value);
    if (value) {
      registerCallPipHandlers({
        onExpand: () => {
          setMinimized(false);
          updateCallPip({ minimized: false, active: true });
        },
        onToggleMute: () => {
          setMuted((m) => !m);
        },
        onEnd: () => void finishCall(true),
      });
      updateCallPip({
        active: true,
        minimized: true,
        callId: call.id,
        call,
        token,
        url,
        peerName,
        peerAvatar,
        durationLabel: formatDuration(duration),
        elapsedSec: duration,
        muted,
      });
    } else {
      updateCallPip({ minimized: false, active: true });
    }
  };

  useEffect(() => {
    if (!minimized) return;
    updateCallPip({
      callId: call.id,
      durationLabel: formatDuration(duration),
      muted,
      peerName,
      peerAvatar,
    });
  }, [minimized, duration, muted, peerName, peerAvatar, call.id]);

  useEffect(() => {
    return () => {
      if (!getCallPipSnapshot().minimized) clearCallPip();
    };
  }, []);

  const blockPeer = async () => {
    if (!peerAuthId) return;
    const ok = await confirmAction(
      `Block ${peerName}?`,
      'They will no longer be able to call or message you.',
      'Block'
    );
    if (!ok) return;
    try {
      await api.friendships.block(peerAuthId);
      showAppToast(`${peerName} blocked`);
      await finishCall(true);
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Could not block user', { isError: true });
    }
  };

  return (
    <View
      style={minimized ? styles.minimizedRoot : [styles.container, { paddingTop: insets.top }]}
      pointerEvents={minimized ? 'box-none' : 'auto'}
    >
      {!minimized ? <StatusBar barStyle="light-content" backgroundColor="#000" /> : null}
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
        onDisconnected={() => {
          if (consumeCallHoldDisconnect()) return;
          const pip = getCallPipSnapshot();
          if (pip.minimized && pip.callId === call.id) return;
          void finishCall(false);
        }}
        onError={(err: Error) => {
          showAppToast(err.message || 'Call error', { isError: true });
          void finishCall(false);
        }}
      >
        <RoomBody
          call={call}
          myAuthId={myAuthId}
          peerAuthId={peerAuthId}
          callType={call.call_type}
          peerName={peerName}
          peerAvatar={peerAvatar}
          duration={duration}
          muted={muted}
          minimized={minimized}
          ringing={ringing}
          AudioSession={AudioSession}
          onToggleMute={async () => {
            setMuted((m) => !m);
          }}
          onEnd={() => finishCall(true)}
          onAddParticipant={() => setShowAddParticipant(true)}
          onMinimize={() => setCallMinimized(true)}
          onExpand={() => setCallMinimized(false)}
          onBlockPeer={() => void blockPeer()}
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
  peerAuthId: string | null;
  callType: 'voice' | 'video';
  peerName: string;
  peerAvatar: string | null;
  duration: number;
  muted: boolean;
  minimized: boolean;
  ringing?: boolean;
  AudioSession?: {
    selectAudioOutput?: (id: string) => Promise<void>;
    getAudioOutputs?: () => Promise<string[]>;
    configureAudio?: (config: Record<string, unknown>) => Promise<void>;
  } | null;
  onToggleMute: () => Promise<void>;
  onEnd: () => void;
  onAddParticipant: () => void;
  onMinimize: () => void;
  onExpand: () => void;
  onBlockPeer: () => void;
  useTracks: (kinds?: unknown[]) => Array<{
    participant: {
      identity: string;
      isLocal: boolean;
      isMicrophoneEnabled?: boolean;
    };
    publication?: { trackSid?: string };
    source: unknown;
  }>;
  VideoTrack: React.ComponentType<{ trackRef: unknown; style?: unknown }>;
  Track: { Source: { Camera: unknown; Microphone: unknown; ScreenShare: unknown } };
  useLocalParticipant: () => {
    localParticipant: {
      setMicrophoneEnabled: (b: boolean) => Promise<void>;
      setCameraEnabled: (b: boolean) => Promise<void>;
      setScreenShareEnabled?: (b: boolean) => Promise<void>;
      getTrackPublication?: (source: unknown) =>
        | { track?: { restartTrack?: (opts: { facingMode: FacingMode }) => Promise<void> } | null }
        | undefined;
      publishData?: (data: Uint8Array, opts: { reliable: boolean; topic: string }) => void;
      isMicrophoneEnabled?: boolean;
    };
  };
  useRoomContext: () => {
    disconnect: () => Promise<void>;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    off?: (event: string, handler: (...args: unknown[]) => void) => void;
    remoteParticipants?: Map<string, { isMicrophoneEnabled?: boolean }>;
  };
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
  const [pipSwapped, setPipSwapped] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [speakerOn, setSpeakerOn] = useState(startedAsVideo);
  const [connQuality, setConnQuality] = useState<CallConnQuality>('unknown');
  const [sharingScreen, setSharingScreen] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting'>(
    'connecting'
  );
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftBalance, setGiftBalance] = useState(0);
  const [heldSession, setHeldSession] = useState<HeldCallSession | null>(getHeldCallSession);
  const extras = useCallExtras('You');
  const extrasHandleRef = React.useRef<(bytes: Uint8Array) => void>(() => undefined);
  extrasHandleRef.current = (bytes) => extras.handleExtrasPayload(bytes, false);
  const msgAlerts = useCallScreenMessageAlerts({
    myAuthId: props.myAuthId,
    enabled: true,
  });
  const messageBadge = extras.unreadChatCount + msgAlerts.unreadCount;

  useEffect(() => subscribeHeldCallSession(setHeldSession), []);

  const switchToHeld = async () => {
    const held = getHeldCallSession();
    if (!held) return;
    beginCallHoldDisconnect();
    try {
      const { held_call, call: next, live_kit } = await api.calls.switchTo(
        props.call.id,
        held.call.id
      );
      setHeldCallSession({
        call: held_call,
        peerName: props.peerName,
      });
      replaceWithActiveCall({
        call: next,
        token: live_kit.token,
        url: live_kit.url,
      });
      showAppToast('Switched call');
    } catch (err) {
      showErrorAlert(
        'Switch',
        err instanceof Error ? err.message : 'Could not switch calls'
      );
    }
  };

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
    // Rare fallback — Realtime topics below drive most refreshes.
    const t = setInterval(() => void load(), 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [props.call.id]);

  useRealtimeTopic(
    'callParticipants',
    () => {
      void (async () => {
        try {
          const { participants } = await api.calls.participants(props.call.id);
          const map = new Map<string, { display_name: string; avatar_url: string | null }>();
          participants.forEach((p) => {
            map.set(p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url });
          });
          setParticipantProfiles(map);
        } catch {
          /* ignore */
        }
      })();
    },
    Boolean(props.call.id)
  );

  const publishSignal = React.useCallback(
    (signal: CallVideoSignal) => {
      localParticipant.publishData?.(encodeCallVideoSignal(signal), {
        reliable: true,
        topic: CALL_VIDEO_TOPIC,
      });
    },
    [localParticipant]
  );

  const publishExtras = React.useCallback(
    (signal: CallExtrasSignal) => {
      if (!localParticipant.publishData) return;
      extras.publishExtras(
        (data, opts) => localParticipant.publishData!(data, opts),
        signal
      );
    },
    [extras.publishExtras, localParticipant]
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
      let bytes: Uint8Array;
      if (payload instanceof Uint8Array) bytes = payload;
      else if (payload instanceof ArrayBuffer) bytes = new Uint8Array(payload);
      else return;
      if (topic === CALL_EXTRAS_TOPIC) {
        extrasHandleRef.current?.(bytes);
        return;
      }
      if (topic && topic !== CALL_VIDEO_TOPIC) return;
      const signal = decodeCallVideoSignal(bytes);
      if (signal) handleSignalRef.current(signal);
    };

    const onQuality = (...args: unknown[]) => {
      const [quality, participant] = args;
      if ((participant as { isLocal?: boolean } | undefined) && !(participant as { isLocal?: boolean }).isLocal) {
        return;
      }
      setConnQuality(normalizeConnQuality(quality));
    };

    roomAny.on('dataReceived', onData);
    roomAny.on('connectionQualityChanged', onQuality);
    let peerGoneTimer: ReturnType<typeof setTimeout> | null = null;
    const onRemoteLeft = () => {
      if (props.call.scope !== 'direct') return;
      const remotes = room.remoteParticipants?.size ?? 0;
      if (remotes !== 0) {
        if (peerGoneTimer) {
          clearTimeout(peerGoneTimer);
          peerGoneTimer = null;
        }
        return;
      }
      if (peerGoneTimer) clearTimeout(peerGoneTimer);
      peerGoneTimer = setTimeout(() => {
        peerGoneTimer = null;
        if ((room.remoteParticipants?.size ?? 0) !== 0) return;
        void (async () => {
          try {
            const { call: latest } = await api.calls.get(props.call.id);
            if (['ended', 'cancelled', 'declined', 'missed'].includes(latest.status)) {
              clearCallPip();
              leaveCallScreen('Calls', 'Call ended');
              return;
            }
            const { participants } = await api.calls.participants(props.call.id);
            const other = participants.find((p) => p.user_id !== props.myAuthId);
            if (other?.state === 'held' || other?.state === 'joined') {
              if (other.state === 'held') showAppToast('Other person put you on hold');
              return;
            }
            await api.calls.end(props.call.id);
          } catch {
            /* ignore */
          }
          clearCallPip();
          leaveCallScreen('Calls', 'Call ended');
        })();
      }, 1200);
    };
    const onRemoteJoined = () => {
      if (peerGoneTimer) {
        clearTimeout(peerGoneTimer);
        peerGoneTimer = null;
      }
    };
    const onReconnecting = () => setConnectionState('reconnecting');
    const onReconnected = () => {
      setConnectionState('connected');
      void import('../../lib/callRowResyncBridge').then((m) =>
        m.requestCallRowResync(props.call.id)
      );
    };
    const onConnected = () => setConnectionState('connected');
    roomAny.on('participantDisconnected', onRemoteLeft);
    roomAny.on('participantConnected', onRemoteJoined);
    roomAny.on('reconnecting', onReconnecting);
    roomAny.on('reconnected', onReconnected);
    roomAny.on('connected', onConnected);
    // Some LiveKit RN builds expose ConnectionStateChanged instead.
    const onConnState = (...args: unknown[]) => {
      const state = String(args[0] ?? '').toLowerCase();
      if (state.includes('reconnect')) {
        setConnectionState('reconnecting');
      } else if (state.includes('connect')) {
        setConnectionState('connected');
      }
    };
    roomAny.on('connectionStateChanged', onConnState);
    return () => {
      if (peerGoneTimer) clearTimeout(peerGoneTimer);
      roomAny.off?.('dataReceived', onData);
      roomAny.off?.('connectionQualityChanged', onQuality);
      roomAny.off?.('participantDisconnected', onRemoteLeft);
      roomAny.off?.('participantConnected', onRemoteJoined);
      roomAny.off?.('reconnecting', onReconnecting);
      roomAny.off?.('reconnected', onReconnected);
      roomAny.off?.('connected', onConnected);
      roomAny.off?.('connectionStateChanged', onConnState);
    };
  }, [room, props.call.id, props.call.scope, props.myAuthId]);

  // When upgrading to video mid-call, prefer speaker once.
  const autoSpeakerRef = React.useRef(startedAsVideo);
  useEffect(() => {
    if (!sharedVideo || !videoEnabled) return;
    if (autoSpeakerRef.current) return;
    autoSpeakerRef.current = true;
    void (async () => {
      const ok = await setCallSpeakerOn(props.AudioSession, true);
      if (ok) setSpeakerOn(true);
    })();
  }, [props.AudioSession, sharedVideo, videoEnabled]);

  const cameraTracks = useTracks([Track?.Source?.Camera].filter(Boolean));
  const remoteTracks = cameraTracks.filter((t) => !t.participant.isLocal);
  const localVideo = cameraTracks.find((t) => t.participant.isLocal);
  const remoteVideo = remoteTracks[0];

  const remoteMuted = remoteVideo?.participant?.isMicrophoneEnabled === false;

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
      const remote = room.remoteParticipants?.get(uid);
      tiles.push({
        identity: uid,
        name: prof.display_name,
        avatarUrl: prof.avatar_url,
        hasVideo: sharedVideo && !!track,
        muted: remote?.isMicrophoneEnabled === false,
      });
    }
    if (props.myAuthId && sharedVideo && videoEnabled) {
      tiles.push({
        identity: props.myAuthId,
        name: 'You',
        avatarUrl: null,
        isLocal: true,
        hasVideo: !!localVideo,
        muted: props.muted,
      });
    }
    return tiles.length > 0 ? tiles : [
      {
        identity: 'peer',
        name: props.peerName,
        avatarUrl: props.peerAvatar,
        hasVideo: sharedVideo && !!remoteVideo,
        muted: remoteMuted,
      },
    ];
  }, [
    isMultiParty,
    participantProfiles,
    cameraTracks,
    props.myAuthId,
    props.peerName,
    props.peerAvatar,
    props.muted,
    sharedVideo,
    videoEnabled,
    localVideo,
    remoteVideo,
    room.remoteParticipants,
    remoteMuted,
  ]);

  const toggleMute = async () => {
    await localParticipant.setMicrophoneEnabled(props.muted /* will become unmuted */);
    await props.onToggleMute();
  };

  const toggleVideo = () => {
    void negotiation.toggleVideo();
  };

  const flipCamera = async () => {
    if (!Track?.Source?.Camera) return;
    const next = await flipLocalCameraFacing(
      localParticipant,
      Track.Source.Camera,
      facingMode
    );
    if (next) setFacingMode(next);
  };

  const toggleSpeaker = async () => {
    const next = !speakerOn;
    const ok = await setCallSpeakerOn(props.AudioSession, next);
    if (ok) setSpeakerOn(next);
  };

  const toggleScreenShare = async () => {
    try {
      const next = !sharingScreen;
      await localParticipant.setScreenShareEnabled?.(next);
      setSharingScreen(next);
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Could not start screen sharing', {
        isError: true,
      });
    }
  };

  const hangup = async () => {
    playCallEndTone();
    try {
      await room.disconnect();
    } finally {
      props.onEnd();
    }
  };

  const qualityHint = connQualityLabel(connQuality);
  const mainVideo = pipSwapped ? localVideo : remoteVideo;
  const pipVideo = pipSwapped ? remoteVideo : localVideo;

  const weakTipShownRef = React.useRef(false);
  const autoAudioOnlyRef = React.useRef(false);
  useEffect(() => {
    if (connQuality !== 'poor' && connQuality !== 'lost') return;
    if (!weakTipShownRef.current) {
      weakTipShownRef.current = true;
      showAppToast('Weak connection — audio preferred for now');
    }
    if (autoAudioOnlyRef.current) return;
    if (!sharedVideo || !videoEnabled) return;
    autoAudioOnlyRef.current = true;
    void negotiation.toggleVideo();
    showAppToast('Switched to audio-only due to weak connection');
  }, [connQuality, negotiation, sharedVideo, videoEnabled]);

  useEffect(() => {
    if (!props.minimized) return;
    if (!sharedVideo || !videoEnabled) return;
    void negotiation.toggleVideo();
  }, [props.minimized]); // eslint-disable-line react-hooks/exhaustive-deps -- once when minimizing

  // Keep mic in sync while floating (full controls unmounted).
  useEffect(() => {
    if (!props.minimized) return;
    void localParticipant.setMicrophoneEnabled(!props.muted);
  }, [props.minimized, props.muted, localParticipant]);

  const openCallMenu = () => {
    if (!props.peerAuthId || props.call.scope !== 'direct') return;
    props.onBlockPeer();
  };

  const isHost = props.call.caller_id === props.myAuthId;
  const tipRecipientId =
    props.peerAuthId && props.peerAuthId !== props.myAuthId
      ? props.peerAuthId
      : props.call.caller_id !== props.myAuthId
        ? props.call.caller_id
        : null;
  const reelContextId =
    typeof (props.call.metadata as { reel_id?: unknown } | null)?.reel_id === 'string'
      ? ((props.call.metadata as { reel_id: string }).reel_id)
      : null;

  const hostMute = async (identity: string) => {
    const name = participantProfiles.get(identity)?.display_name ?? 'participant';
    const ok = await confirmAction(`Mute ${name}?`, 'They will be force-muted for this call.', 'Mute');
    if (!ok) return;
    try {
      await api.calls.mute(props.call.id, identity);
      showAppToast(`${name} muted`);
    } catch (err) {
      showErrorAlert('Mute', err instanceof Error ? err.message : 'Could not mute');
    }
  };

  const hostRemove = async (identity: string) => {
    const name = participantProfiles.get(identity)?.display_name ?? 'participant';
    const ok = await confirmAction(
      `Remove ${name}?`,
      'They will be disconnected from this call.',
      'Remove'
    );
    if (!ok) return;
    try {
      await api.calls.remove(props.call.id, identity);
      showAppToast(`${name} removed`);
    } catch (err) {
      showErrorAlert('Remove', err instanceof Error ? err.message : 'Could not remove');
    }
  };

  useEffect(() => {
    if (!extras.recordingRequestAt) return;
    let alive = true;
    void (async () => {
      const ok = await confirmToast({
        message: 'Host wants to record this call. Allow recording?',
        confirmLabel: 'Allow',
        cancelLabel: 'Decline',
        destructive: false,
      });
      if (!alive) return;
      publishExtras({ type: 'recording_consent', allowed: ok, at: Date.now() });
      extras.clearRecordingRequest();
      showAppToast(ok ? 'You allowed recording' : 'You declined recording');
    })();
    return () => {
      alive = false;
    };
  }, [extras.recordingRequestAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestRecording = async () => {
    const ok = await confirmToast({
      message: 'Ask everyone to consent before recording this call?',
      confirmLabel: 'Ask',
      cancelLabel: 'Cancel',
      destructive: false,
    });
    if (!ok) return;
    publishExtras({ type: 'recording_request', at: Date.now() });
    extras.setRecordingActive(true);
    showAppToast('Recording consent requested');
  };

  const openTipSheet = async () => {
    if (!tipRecipientId) {
      showAppToast('No tip recipient on this call');
      return;
    }
    try {
      const bal = await api.wallet.balance();
      setGiftBalance(bal.balance_coins ?? 0);
    } catch {
      setGiftBalance(0);
    }
    setGiftOpen(true);
  };

  if (props.minimized) {
    // Keep LiveKitRoom mounted above; bubble is FloatingCallOverlay.
    return null;
  }

  return (
    <View style={styles.roomBody}>
      <View style={styles.topChrome}>
        <TouchableOpacity
          style={styles.chromeBtn}
          onPress={props.onMinimize}
          accessibilityLabel="Minimize call"
        >
          <Ionicons name="chevron-down" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {isHost || tipRecipientId ? (
          <TouchableOpacity
            style={styles.chromeBtn}
            onPress={() => void requestRecording()}
            accessibilityLabel="Request recording consent"
          >
            <Ionicons
              name={extras.recordingActive ? 'radio-button-on' : 'recording-outline'}
              size={20}
              color={extras.recordingActive ? '#ef4444' : '#fff'}
            />
          </TouchableOpacity>
        ) : null}
        {props.call.scope === 'direct' && props.peerAuthId ? (
          <TouchableOpacity
            style={styles.chromeBtn}
            onPress={openCallMenu}
            accessibilityLabel="Call options"
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>
      {heldSession ? (
        <TouchableOpacity style={styles.heldBanner} onPress={() => void switchToHeld()}>
          <Ionicons name="swap-horizontal" size={16} color="#fff" />
          <Text style={styles.heldBannerText} numberOfLines={1}>
            {heldSession.peerName ?? 'Call'} on hold — tap to switch
          </Text>
        </TouchableOpacity>
      ) : null}
      {reelContextId ? (
        <View style={styles.reelContextChip}>
          <Ionicons name="film-outline" size={14} color="#fff" />
          <Text style={styles.reelContextText}>About a reel</Text>
        </View>
      ) : null}
      {extras.recordingActive ? (
        <View style={styles.recordingBanner}>
          <Ionicons name="radio-button-on" size={12} color="#fff" />
          <Text style={styles.recordingText}>Recording consent active</Text>
        </View>
      ) : null}
      {extras.incomingGiftBurst ? (
        <View style={styles.giftBurst} pointerEvents="none">
          <Text style={styles.giftBurstEmoji}>{extras.incomingGiftBurst}</Text>
        </View>
      ) : null}
      <VideoRequestOverlay
        peerName={props.peerName}
        incomingVisible={incomingRequest}
        outgoingVisible={outgoingRequest}
        onAccept={() => void negotiation.acceptIncomingVideo()}
        onDecline={negotiation.declineIncomingVideo}
      />
      {qualityHint || connectionState !== 'connected' ? (
        <View style={styles.nativeQualityBanner}>
          <Ionicons
            name={qualityHint ? 'cellular-outline' : 'sync-outline'}
            size={14}
            color="#fff"
          />
          <Text style={styles.webConnectionText}>
            {qualityHint
              ? qualityHint
              : connectionState === 'reconnecting'
                ? 'Reconnecting…'
                : 'Connecting…'}
          </Text>
        </View>
      ) : null}
      <View style={styles.remoteWrap}>
        {isMultiParty ? (
          <CallParticipantGrid
            participants={gridParticipants}
            isHost={isHost}
            onHostMute={(id) => void hostMute(id)}
            onHostRemove={(id) => void hostRemove(id)}
            renderVideo={(p, style) => {
              const track = cameraTracks.find((t) => t.participant.identity === p.identity);
              return track ? <VideoTrack trackRef={track} style={style} /> : null;
            }}
          />
        ) : sharedVideo && mainVideo ? (
          <TouchableOpacity
            activeOpacity={1}
            style={StyleSheet.absoluteFill}
            onPress={() => videoEnabled && setPipSwapped((s) => !s)}
          >
            <VideoTrack trackRef={mainVideo} style={styles.remoteVideo} />
          </TouchableOpacity>
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
              {props.ringing
                ? 'Ringing…'
                : sharedVideo
                  ? 'Connecting…'
                  : isMultiParty
                    ? 'Group call'
                    : 'On call'}
            </Text>
            {remoteMuted ? (
              <View style={styles.peerMuteRow}>
                <Ionicons name="mic-off" size={14} color="#ff8a80" />
                <Text style={styles.peerMuteText}>Muted</Text>
              </View>
            ) : null}
            {sharedVideo && !startedAsVideo && videoEnabled && (
              <Text style={styles.revertHint}>Tap camera to switch back to voice</Text>
            )}
          </View>
        )}

        {!isMultiParty && sharedVideo && pipVideo && videoEnabled && (
          <TouchableOpacity
            style={styles.pip}
            activeOpacity={0.9}
            onPress={() => setPipSwapped((s) => !s)}
          >
            <VideoTrack trackRef={pipVideo} style={styles.pipVideo} />
            {(pipSwapped ? remoteMuted : props.muted) ? (
              <View style={styles.pipMuteBadge}>
                <Ionicons name="mic-off" size={12} color="#fff" />
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bar}>
        <Text style={styles.duration}>{formatDuration(props.duration)}</Text>
      </View>

      <CallReactionsBar
        myName="You"
        publish={publishExtras}
        incoming={extras.incomingReaction}
      />

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
        {sharedVideo && videoEnabled ? (
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => void flipCamera()}>
            <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          </TouchableOpacity>
        ) : null}
        {sharedVideo && videoEnabled ? (
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => {
              void import('./callBackgroundBlur').then((m) =>
                m.toggleCallBackgroundBlur(true)
              );
            }}
            accessibilityLabel="Background blur"
          >
            <Ionicons name="water-outline" size={24} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.ctrlBtn, speakerOn && styles.ctrlBtnActive]}
          onPress={() => void toggleSpeaker()}
        >
          <Ionicons name={speakerOn ? 'volume-high' : 'ear-outline'} size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ctrlBtn, sharingScreen && styles.ctrlBtnActive]}
          onPress={() => void toggleScreenShare()}
        >
          <Ionicons name="desktop-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={() => {
            extras.openChat();
            msgAlerts.clearUnread();
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={24} color="#fff" />
          <CallMsgBadge count={messageBadge} />
        </TouchableOpacity>
        {tipRecipientId ? (
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => void openTipSheet()}>
            <Ionicons name="gift-outline" size={24} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.ctrlBtn} onPress={props.onAddParticipant}>
          <Ionicons name="person-add" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ctrlBtn, styles.endBtn]}
          onPress={() => void hangup()}
          accessibilityLabel={props.call.scope === 'group' ? 'Leave call' : 'End call'}
        >
          <Ionicons
            name="call"
            size={26}
            color="#fff"
            style={{ transform: [{ rotate: '135deg' }] }}
          />
        </TouchableOpacity>
      </View>

      <CallInCallChat
        visible={extras.chatOpen}
        onClose={() => extras.closeChat()}
        myName="You"
        publish={publishExtras}
        messages={extras.messages}
        onLocalSend={extras.onLocalChat}
      />
      {tipRecipientId ? (
        <CallGiftSheet
          visible={giftOpen}
          callId={props.call.id}
          recipientUserId={tipRecipientId}
          recipientName={
            tipRecipientId === props.peerAuthId
              ? props.peerName
              : participantProfiles.get(tipRecipientId)?.display_name ?? 'Host'
          }
          balanceCoins={giftBalance}
          onClose={() => setGiftOpen(false)}
          onSent={({ gift, balanceCoins }) => {
            setGiftBalance(balanceCoins);
            publishExtras({ type: 'gift', emoji: gift.emoji, at: Date.now() });
            showAppToast(`Sent ${gift.emoji} ${gift.name}`);
          }}
          onBuyCoins={() => {
            setGiftOpen(false);
            showAppToast('Buy coins from Creator Wallet in Reels');
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  minimizedRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topChrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 4,
    zIndex: 40,
  },
  chromeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  webBadgeWrapInline: { alignItems: 'center' },
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
    zIndex: 5,
  },
  pipVideo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  pipMuteBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    padding: 4,
  },
  fullBleed: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  mediaFill: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  } as object,
  nativeQualityBanner: {
    position: 'absolute',
    top: 56,
    left: 12,
    zIndex: 30,
    backgroundColor: 'rgba(183, 28, 28, 0.85)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  peerMuteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  peerMuteText: { color: '#ff8a80', fontSize: 13, fontWeight: '600' },
  bar: {
    paddingTop: 4,
    paddingBottom: 8,
    alignItems: 'center',
    marginBottom: 52,
    zIndex: 26,
  },
  duration: { color: '#fff', fontSize: 15, fontWeight: '600' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  ctrlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctrlBtnActive: { backgroundColor: '#1976d2' },
  msgBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#111',
  },
  msgBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  endBtn: { backgroundColor: '#ef4444' },
  errorText: { color: '#fff', textAlign: 'center', paddingHorizontal: 32, marginTop: 16 },
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
    top: 56,
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
  reelContextChip: {
    position: 'absolute',
    top: 56,
    right: 12,
    zIndex: 35,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(37,99,235,0.85)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reelContextText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heldBanner: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    zIndex: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.95)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  heldBannerText: { color: '#111', fontSize: 13, fontWeight: '800', flex: 1 },
  recordingBanner: {
    position: 'absolute',
    top: 56,
    left: 12,
    zIndex: 35,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(220,38,38,0.9)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recordingText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  giftBurst: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftBurstEmoji: { fontSize: 72 },
});
