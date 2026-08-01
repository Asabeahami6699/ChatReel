import { env } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getUnreadBadgeCount } from './unreadBadge';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Absolute unread count for the app icon. Computed per recipient when omitted. */
  badge?: number;
  /** Android: replace already-displayed notification with same tag. */
  tag?: string;
  /** Coalesce / replace in-transit + iOS displayed notifications. */
  collapseId?: string;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

/** WhatsApp-style: one banner for all chat messages, expandable via multiline body. */
const MESSAGE_GROUP_TAG = 'chatreel_messages';
const MAX_GROUPED_LINES = 8;
const GROUP_TTL_MS = 2 * 60 * 60 * 1000;

type GroupedLine = {
  chatId: string;
  chatType: string;
  chatName: string;
  line: string;
  at: number;
};

const groupedByUser = new Map<string, GroupedLine[]>();

function channelIdFor(data?: Record<string, unknown>): string {
  const type = typeof data?.type === 'string' ? data.type : '';
  if (
    type === 'reel_gift' ||
    type === 'reel_like' ||
    type === 'reel_comment' ||
    type === 'new_reel'
  ) {
    return 'reel_inbox';
  }
  if (type === 'message' || type === 'friend_request' || type === 'friend_accepted') {
    return 'default';
  }
  if (type === 'incoming_call') return 'calls';
  return 'default';
}

function pruneGrouped(userId: string): GroupedLine[] {
  const now = Date.now();
  const kept = (groupedByUser.get(userId) ?? []).filter((l) => now - l.at < GROUP_TTL_MS);
  if (kept.length) groupedByUser.set(userId, kept);
  else groupedByUser.delete(userId);
  return kept;
}

/**
 * Append a message line and return WhatsApp-style title/body for one expandable banner.
 */
function accumulateMessageGroup(
  userId: string,
  payload: PushPayload
): { title: string; body: string; data: Record<string, unknown> } {
  const data = { ...(payload.data ?? {}) };
  const chatId = typeof data.chat_id === 'string' ? data.chat_id : 'unknown';
  const chatType = typeof data.chat_type === 'string' ? data.chat_type : 'individual';
  const chatName =
    typeof data.chat_name === 'string' && data.chat_name.trim()
      ? data.chat_name
      : payload.title || 'Chat';

  const line =
    chatType === 'group'
      ? payload.body
      : `${payload.title}: ${payload.body}`;

  const lines = pruneGrouped(userId);
  lines.push({
    chatId,
    chatType,
    chatName,
    line: line.slice(0, 160),
    at: Date.now(),
  });
  const trimmed = lines.slice(-MAX_GROUPED_LINES);
  groupedByUser.set(userId, trimmed);

  const count = trimmed.length;
  const title = count === 1 ? payload.title : `${count} new messages`;
  const body = trimmed.map((l) => l.line).join('\n');
  const latest = trimmed[trimmed.length - 1];

  return {
    title,
    body,
    data: {
      ...data,
      chat_id: latest.chatId,
      chat_type: latest.chatType,
      chat_name: latest.chatName,
      grouped_count: count,
    },
  };
}

/** Clear stacked message previews when the user opens the app / a chat. */
export function clearGroupedMessagePush(userId: string): void {
  groupedByUser.delete(userId);
}

export async function getAuthUserIdByProfileId(profileId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('id', profileId)
    .maybeSingle();
  return data?.user_id ?? null;
}

export async function getAuthUserIdsByProfileIds(profileIds: string[]): Promise<string[]> {
  const unique = [...new Set(profileIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .in('id', unique);

  if (error || !data?.length) return [];
  return [
    ...new Set(
      data
        .map((row) => row.user_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

async function pruneInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await supabaseAdmin.from('push_tokens').delete().in('token', tokens);
  if (error) console.warn('[push] prune tokens failed:', error.message);
}

async function postExpoPush(
  messages: Array<{
    to: string;
    sound: 'default';
    title: string;
    body: string;
    data: Record<string, unknown>;
    channelId: string;
    priority: 'high';
    badge?: number;
    categoryId?: string;
    tag?: string;
    collapseId?: string;
    _contentAvailable?: boolean;
    interruptionLevel?: 'active' | 'critical' | 'passive' | 'timeSensitive';
  }>
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (env.expoAccessToken) {
    headers.Authorization = `Bearer ${env.expoAccessToken}`;
  }

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: Array<{ status?: string; details?: { error?: string }; message?: string }>;
      } | null;

      if (!res.ok) {
        console.warn('[push] Expo API error:', res.status, JSON.stringify(json).slice(0, 400));
        continue;
      }

      const dead: string[] = [];
      for (let j = 0; j < (json?.data?.length ?? 0); j++) {
        const ticket = json!.data![j];
        if (ticket?.status !== 'error') continue;
        const errCode = ticket.details?.error ?? ticket.message ?? '';
        if (
          /DeviceNotRegistered|InvalidCredentials|MismatchSenderId/i.test(errCode) ||
          errCode === 'DeviceNotRegistered'
        ) {
          dead.push(chunk[j].to);
        }
      }
      if (dead.length) await pruneInvalidTokens(dead);
    } catch (err) {
      console.warn('[push] Failed to send batch:', err);
    }
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  await sendPushToUsers([userId], payload);
}

/** Fan-out the same notification to many auth user ids (deduped). */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const { data: tokens, error } = await supabaseAdmin
    .from('push_tokens')
    .select('token, user_id')
    .in('user_id', uniqueIds);

  if (error || !tokens?.length) return;

  const channelId = channelIdFor(payload.data);
  const isCall = payload.data?.type === 'incoming_call';
  const isMessage = payload.data?.type === 'message';

  // Resolve badge once per recipient so the icon count matches SMS-style unread.
  const badgeByUser = new Map<string, number>();
  if (payload.badge != null && Number.isFinite(payload.badge)) {
    for (const id of uniqueIds) badgeByUser.set(id, Math.max(0, Math.floor(payload.badge)));
  } else if (isMessage || payload.data?.type === 'friend_request') {
    await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          badgeByUser.set(id, await getUnreadBadgeCount(id));
        } catch (err) {
          console.warn('[push] badge count failed for', id, err);
        }
      })
    );
  }

  // Build grouped message banner once per recipient (not once per device token).
  const messageContentByUser = new Map<
    string,
    { title: string; body: string; data: Record<string, unknown> }
  >();
  if (isMessage) {
    for (const id of uniqueIds) {
      messageContentByUser.set(id, accumulateMessageGroup(id, payload));
    }
  }

  const messages = tokens.map((row) => {
    const uid = row.user_id as string;
    const badge = badgeByUser.get(uid);
    const grouped = messageContentByUser.get(uid);

    const title = grouped?.title ?? payload.title;
    const body = grouped?.body ?? payload.body;
    const data: Record<string, unknown> = {
      ...(grouped?.data ?? payload.data ?? {}),
      ...(badge != null ? { badge } : {}),
    };
    const tag = isMessage ? MESSAGE_GROUP_TAG : payload.tag;
    const collapseId = isMessage ? MESSAGE_GROUP_TAG : payload.collapseId;

    return {
      to: row.token as string,
      sound: 'default' as const,
      title,
      body,
      data,
      channelId,
      priority: 'high' as const,
      ...(badge != null ? { badge } : {}),
      ...(isMessage ? { categoryId: 'message_reply' } : {}),
      ...(tag ? { tag } : {}),
      ...(collapseId ? { collapseId } : {}),
      ...(isCall
        ? {
            _contentAvailable: true,
            interruptionLevel: 'timeSensitive' as const,
          }
        : {}),
    };
  });

  await postExpoPush(messages);
}

export function sendPushToUserSafe(userId: string, payload: PushPayload): void {
  // Phase 3: go through the job queue (memory or Redis).
  void import('../lib/pushQueue').then((m) => m.enqueuePushToUser(userId, payload));
}

export function sendPushToUsersSafe(userIds: string[], payload: PushPayload): void {
  void import('../lib/pushQueue').then((m) => m.enqueuePushToUsers(userIds, payload));
}
