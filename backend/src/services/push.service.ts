import { env } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

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
  const messages = tokens.map((row) => ({
    to: row.token as string,
    sound: 'default' as const,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    channelId,
    priority: 'high' as const,
    // Wake path for ringing while backgrounded (best-effort on iOS).
    ...(isCall
      ? {
          _contentAvailable: true,
          interruptionLevel: 'timeSensitive' as const,
        }
      : {}),
  }));

  await postExpoPush(messages);
}

export function sendPushToUserSafe(userId: string, payload: PushPayload): void {
  // Phase 3: go through the job queue (memory or Redis).
  void import('../lib/pushQueue').then((m) => m.enqueuePushToUser(userId, payload));
}

export function sendPushToUsersSafe(userIds: string[], payload: PushPayload): void {
  void import('../lib/pushQueue').then((m) => m.enqueuePushToUsers(userIds, payload));
}
