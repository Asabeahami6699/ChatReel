import React, { useEffect, useState } from 'react';
import { MiniCallBubble } from '../screens/Call/MiniCallBubble';
import {
  callPipEnd,
  callPipExpand,
  callPipToggleMute,
  getCallPipSnapshot,
  subscribeCallPip,
  type CallPipSnapshot,
} from '../screens/Call/callPipBridge';

/**
 * Global floating call UI while ActiveCall is minimized so users can
 * browse chats/reels with LiveKit still running underneath.
 */
export function FloatingCallOverlay() {
  const [snap, setSnap] = useState<CallPipSnapshot>(getCallPipSnapshot);

  useEffect(() => subscribeCallPip(() => setSnap(getCallPipSnapshot())), []);

  if (!snap.active || !snap.minimized) return null;

  return (
    <MiniCallBubble
      peerName={snap.peerName}
      peerAvatar={snap.peerAvatar}
      durationLabel={snap.durationLabel}
      muted={snap.muted}
      onExpand={callPipExpand}
      onToggleMute={callPipToggleMute}
      onEnd={callPipEnd}
    />
  );
}
