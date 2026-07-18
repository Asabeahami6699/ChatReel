import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CALL_EXTRAS_TOPIC,
  decodeCallExtrasSignal,
  encodeCallExtrasSignal,
  type CallExtrasSignal,
} from './callExtrasSignaling';
import { appendRemoteChat, type InCallChatMessage } from './CallInCallChat';
import { reactionFromSignal } from './CallReactionsBar';
import { showAppToast } from '../../lib/appToast';

type FloatingReaction = ReturnType<typeof reactionFromSignal>;

type PublishData = (
  data: Uint8Array,
  opts: { reliable: boolean; topic: string }
) => void;

export function useCallExtras(myName: string) {
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<InCallChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [incomingReaction, setIncomingReaction] = useState<FloatingReaction | null>(null);
  const [incomingGiftBurst, setIncomingGiftBurst] = useState<string | null>(null);
  const [recordingRequestAt, setRecordingRequestAt] = useState<number | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const chatOpenRef = useRef(false);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  const publishExtras = useCallback(
    (publishData: PublishData | null | undefined, signal: CallExtrasSignal) => {
      if (!publishData) return;
      try {
        publishData(encodeCallExtrasSignal(signal), {
          reliable: true,
          topic: CALL_EXTRAS_TOPIC,
        });
      } catch (err) {
        console.warn('[call extras] publish failed', err);
      }
    },
    []
  );

  const handleExtrasPayload = useCallback((payload: Uint8Array, isLocal: boolean) => {
    if (isLocal) return;
    const signal = decodeCallExtrasSignal(payload);
    if (!signal) return;
    if (signal.type === 'chat') {
      const msg = appendRemoteChat(signal, false);
      setMessages((prev) => [...prev.slice(-80), msg]);
      if (!chatOpenRef.current) {
        setUnreadChatCount((n) => Math.min(99, n + 1));
        const who = msg.name || 'Someone';
        showAppToast(`${who}: ${msg.text}`);
      }
      return;
    }
    if (signal.type === 'reaction') {
      setIncomingReaction(reactionFromSignal(signal.kind, signal.name, signal.at));
      return;
    }
    if (signal.type === 'gift') {
      setIncomingGiftBurst(signal.emoji);
      setTimeout(() => setIncomingGiftBurst(null), 2200);
      return;
    }
    if (signal.type === 'recording_request') {
      setRecordingRequestAt(signal.at);
      return;
    }
    if (signal.type === 'recording_consent') {
      if (signal.allowed) setRecordingActive(true);
      return;
    }
  }, []);

  const onLocalChat = useCallback((msg: InCallChatMessage) => {
    setMessages((prev) => [...prev.slice(-80), msg]);
  }, []);

  const openChat = useCallback(() => {
    setChatOpen(true);
    setUnreadChatCount(0);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  const clearRecordingRequest = useCallback(() => setRecordingRequestAt(null), []);

  return {
    chatOpen,
    setChatOpen,
    openChat,
    closeChat,
    messages,
    onLocalChat,
    unreadChatCount,
    incomingReaction,
    incomingGiftBurst,
    recordingRequestAt,
    recordingActive,
    setRecordingActive,
    clearRecordingRequest,
    publishExtras,
    handleExtrasPayload,
    myName,
  };
}

export { CALL_EXTRAS_TOPIC };
