import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api, type CallDTO } from '../lib/api';
import { subscribeCallRowResync } from '../lib/callRowResyncBridge';
import { useRealtimeTopic } from './useRealtimeTopic';

/** Rare safety net when Realtime briefly misses an event. */
const FALLBACK_POLL_MS = 45_000;
const MIN_GAP_MS = 400;

type Options = {
  /** While ringing / waiting, poll faster so accept isn't missed. */
  fastPollMs?: number | null;
};

/**
 * Keep a call row fresh via Realtime-first signaling.
 * HTTP is used for the initial load, Realtime-driven refreshes, app focus,
 * and a slow fallback poll — not a 1–2s heartbeat (unless fastPollMs is set).
 */
export function useCallRowSync(
  callId: string | undefined,
  onCall: (call: CallDTO) => void,
  enabled = true,
  options?: Options
) {
  const onCallRef = useRef(onCall);
  onCallRef.current = onCall;
  const lastAtRef = useRef(0);
  const fastPollMs = options?.fastPollMs ?? null;

  const refresh = useCallback(async (force = false) => {
    if (!callId || !enabled) return;
    const now = Date.now();
    if (!force && now - lastAtRef.current < MIN_GAP_MS) return;
    lastAtRef.current = now;
    try {
      const { call } = await api.calls.get(callId);
      onCallRef.current(call as CallDTO);
    } catch {
      /* transient */
    }
  }, [callId, enabled]);

  useEffect(() => {
    if (!callId || !enabled) return;
    void refresh(true);
    const intervalMs =
      typeof fastPollMs === 'number' && fastPollMs > 0 ? fastPollMs : FALLBACK_POLL_MS;
    const t = setInterval(() => void refresh(), intervalMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh(true);
    });
    const unsubBridge = subscribeCallRowResync((id) => {
      if (!id || id === callId) void refresh(true);
    });
    return () => {
      clearInterval(t);
      sub.remove();
      unsubBridge();
    };
  }, [callId, enabled, refresh, fastPollMs]);

  useRealtimeTopic('calls', () => void refresh(true), Boolean(callId && enabled));
  useRealtimeTopic('callParticipants', () => void refresh(true), Boolean(callId && enabled));

  return { refresh };
}
