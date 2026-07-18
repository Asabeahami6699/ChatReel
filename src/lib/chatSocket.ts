/**
 * Client-side Phase 3 chat WebSocket (own socket gateway).
 * Complements Supabase Realtime; reconnects with backoff.
 */
import { AppState, Platform } from 'react-native';
import { config } from './config';
import { ensureSupabaseSession } from './ensureSupabaseSession';
import { getInstallationId } from './installationId';

type Listener = (event: Record<string, unknown>) => void;

let socket: WebSocket | null = null;
let deviceId = '';
let intentionalClose = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 1000;
const listeners = new Set<Listener>();
const subscribedChats = new Set<string>();

function wsBaseUrl(): string {
  const http = (config.apiUrl || '').replace(/\/$/, '');
  if (http.startsWith('https://')) return http.replace(/^https/, 'wss');
  return http.replace(/^http/, 'ws');
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    // Stable per-install id (survives restarts and logout).
    deviceId = `dev-${Platform.OS}-${await getInstallationId()}`;
  } catch {
    // Extremely unlikely; keep the socket usable with a process-scoped id.
    deviceId = `dev-${Platform.OS}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return deviceId;
}

export function onChatSocketEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitLocal(event: Record<string, unknown>) {
  listeners.forEach((l) => {
    try {
      l(event);
    } catch (e) {
      console.warn('[chatSocket] listener error', e);
    }
  });
}

function scheduleReconnect() {
  if (intentionalClose) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectChatSocket();
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, 30_000);
}

export async function connectChatSocket(): Promise<void> {
  intentionalClose = false;
  const session = await ensureSupabaseSession();
  const token = session?.access_token;
  if (!token) return;

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const id = await getOrCreateDeviceId();

  // Re-check: another connect may have raced while we awaited the device id.
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  // Authenticate in the first socket frame so access tokens never appear in
  // URLs, proxy logs, or browser history.
  const url = `${wsBaseUrl()}/ws`;

  try {
    socket = new WebSocket(url);
  } catch (err) {
    console.warn('[chatSocket] open failed', err);
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    backoffMs = 1000;
    socket?.send(JSON.stringify({ type: 'auth', token, device_id: id }));
  };

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
      if (data.type === 'ready') {
        for (const key of subscribedChats) {
          socket?.send(JSON.stringify({ type: 'subscribe', chat_key: key }));
        }
        // Best-effort device registry after the socket confirms authentication.
        void import('./api').then(({ api }) =>
          api.realtime
            ?.registerDevice?.({
              device_id: id,
              platform: Platform.OS,
            })
            .catch(() => undefined)
        );
      }
      emitLocal(data);
    } catch {
      /* ignore */
    }
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    /* onclose will fire */
  };
}

export function disconnectChatSocket() {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

export function subscribeChatSocket(chatKey: string) {
  subscribedChats.add(chatKey);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', chat_key: chatKey }));
  }
}

export function unsubscribeChatSocket(chatKey: string) {
  subscribedChats.delete(chatKey);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'unsubscribe', chat_key: chatKey }));
  }
}

export function sendTypingOnSocket(chatKey: string, active: boolean) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'typing', chat_key: chatKey, active }));
}

/** Keepalive when app returns to foreground. */
export function attachChatSocketAppState() {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void connectChatSocket();
  });
  return () => sub.remove();
}
