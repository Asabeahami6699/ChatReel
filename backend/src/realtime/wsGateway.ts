import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { env } from '../config/env';
import { resolveAuthUserId } from '../middleware/auth';
import { incSloMetric } from '../lib/sloMetrics';
import { supabaseAdmin } from '../lib/supabaseAdmin';

type ClientState = {
  userId: string;
  deviceId: string;
  chats: Set<string>;
};

type WsMessage = {
  type: string;
  [key: string]: unknown;
};

const clients = new Map<WebSocket, ClientState>();
/** userId → sockets */
const byUser = new Map<string, Set<WebSocket>>();

function send(ws: WebSocket, msg: WsMessage) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
  incSloMetric('ws_events_out');
}

function bindUser(ws: WebSocket, state: ClientState) {
  clients.set(ws, state);
  let set = byUser.get(state.userId);
  if (!set) {
    set = new Set();
    byUser.set(state.userId, set);
  }
  set.add(ws);
}

function unbind(ws: WebSocket) {
  const state = clients.get(ws);
  clients.delete(ws);
  if (!state) return;
  const set = byUser.get(state.userId);
  if (!set) return;
  set.delete(ws);
  if (!set.size) byUser.delete(state.userId);
}

async function canSubscribeToChat(userId: string, chatKey: string): Promise<boolean> {
  const dm = /^dm:([^:]+):([^:]+)$/.exec(chatKey);
  if (dm) return dm[1] === userId || dm[2] === userId;

  const group = /^group:([^:]+)$/.exec(chatKey);
  if (!group) return false;
  const { data, error } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('group_id', group[1])
    .eq('user_id', userId)
    .maybeSingle();
  return !error && Boolean(data);
}

/**
 * Emit to all sockets for a user (multi-device), optionally excluding a device.
 */
export function emitToUser(
  userId: string,
  event: WsMessage,
  opts?: { excludeDeviceId?: string }
) {
  const set = byUser.get(userId);
  if (!set?.size) return 0;
  let n = 0;
  for (const ws of set) {
    const st = clients.get(ws);
    if (!st) continue;
    if (opts?.excludeDeviceId && st.deviceId === opts.excludeDeviceId) continue;
    send(ws, event);
    n += 1;
  }
  return n;
}

/** Emit to sockets subscribed to a chat room key. */
export function emitToChat(chatKey: string, event: WsMessage) {
  let n = 0;
  for (const [ws, st] of clients) {
    if (!st.chats.has(chatKey)) continue;
    send(ws, event);
    n += 1;
  }
  return n;
}

export function chatKeyFor(opts: {
  isGroup: boolean;
  chatId: string;
  userA?: string;
  userB?: string;
}): string {
  if (opts.isGroup) return `group:${opts.chatId}`;
  const a = opts.userA!;
  const b = opts.userB!;
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export function getWsStats() {
  return {
    connections: clients.size,
    users_online: byUser.size,
  };
}

export function attachChatWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: env.wsPath });

  wss.on('connection', (ws, req) => {
    incSloMetric('ws_connections');
    let authed = false;

    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const queryToken = url.searchParams.get('token');

    const tryAuth = async (token: string, deviceId: string) => {
      const userId = await resolveAuthUserId(token);
      if (!userId) {
        incSloMetric('ws_auth_fail');
        send(ws, { type: 'error', code: 'AUTH_FAILED', message: 'Invalid token' });
        ws.close(4401, 'unauthorized');
        return;
      }
      authed = true;
      incSloMetric('ws_auth_ok');
      bindUser(ws, {
        userId,
        deviceId: deviceId || 'default',
        chats: new Set(),
      });
      send(ws, {
        type: 'ready',
        user_id: userId,
        device_id: deviceId || 'default',
        region: env.regionId,
        e2e_mode: env.e2eMode,
      });
    };

    if (queryToken) {
      void tryAuth(queryToken, url.searchParams.get('device_id') || 'default');
    } else {
      send(ws, { type: 'hello', message: 'Send {type:"auth", token, device_id}' });
    }

    ws.on('message', (raw) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(String(raw)) as WsMessage;
      } catch {
        send(ws, { type: 'error', code: 'BAD_JSON' });
        return;
      }

      if (msg.type === 'ping') {
        send(ws, { type: 'pong', t: Date.now() });
        return;
      }

      if (msg.type === 'auth') {
        void tryAuth(String(msg.token || ''), String(msg.device_id || 'default'));
        return;
      }

      if (!authed) {
        send(ws, { type: 'error', code: 'AUTH_REQUIRED' });
        return;
      }

      const state = clients.get(ws);
      if (!state) return;

      if (msg.type === 'subscribe') {
        const key = String(msg.chat_key || '');
        void canSubscribeToChat(state.userId, key).then((allowed) => {
          if (!allowed) {
            send(ws, { type: 'error', code: 'CHAT_FORBIDDEN', chat_key: key });
            return;
          }
          state.chats.add(key);
          send(ws, { type: 'subscribed', chat_key: key });
        });
        return;
      }

      if (msg.type === 'unsubscribe') {
        const key = String(msg.chat_key || '');
        state.chats.delete(key);
        send(ws, { type: 'unsubscribed', chat_key: key });
        return;
      }

      if (msg.type === 'typing') {
        const key = String(msg.chat_key || '');
        if (!state.chats.has(key)) {
          send(ws, { type: 'error', code: 'CHAT_NOT_SUBSCRIBED', chat_key: key });
          return;
        }
        emitToChat(key, {
          type: 'typing',
          chat_key: key,
          user_id: state.userId,
          active: Boolean(msg.active),
        });
        return;
      }
    });

    ws.on('close', () => unbind(ws));
    ws.on('error', () => unbind(ws));
  });

  console.log(`[ws] gateway on path ${env.wsPath}`);
  return wss;
}
