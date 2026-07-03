import { AccessToken } from 'livekit-server-sdk';
import { env, isLiveKitConfigured } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export type CallScope = 'direct' | 'group';
export type CallType = 'voice' | 'video';
export type CallStatus =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'missed'
  | 'ended'
  | 'cancelled';

export type CallRow = {
  id: string;
  room_name: string;
  call_type: CallType;
  scope: CallScope;
  caller_id: string;
  callee_id: string | null;
  group_id: string | null;
  status: CallStatus;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Mint a short-lived LiveKit access token for `userId` to join `roomName`.
 * Throws if LiveKit isn't configured.
 */
export async function createLiveKitToken(opts: {
  userId: string;
  identity?: string;
  displayName?: string;
  roomName: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
}): Promise<{ token: string; url: string; expiresAt: string }> {
  if (!isLiveKitConfigured()) {
    throw new Error('LiveKit is not configured on the server');
  }

  const ttl = env.liveKit.tokenTtlSeconds;
  const at = new AccessToken(env.liveKit.apiKey, env.liveKit.apiSecret, {
    identity: opts.identity ?? opts.userId,
    name: opts.displayName,
    ttl,
  });

  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: opts.canPublish ?? true,
    canSubscribe: opts.canSubscribe ?? true,
    canPublishData: true,
  });

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const rawJwt = await at.toJwt();
  const token = typeof rawJwt === 'string' ? rawJwt : String(rawJwt ?? '');
  return {
    token,
    url: env.liveKit.url,
    expiresAt,
  };
}

/**
 * Stable room name for a 1:1 call. We sort the two user ids so it's the same
 * regardless of who initiated, but suffix with timestamp so each call gets a
 * fresh room. (Old rooms are cheap to leave behind on LiveKit.)
 */
export function makeDirectRoomName(callerId: string, calleeId: string): string {
  const [a, b] = [callerId, calleeId].sort();
  const ts = Date.now().toString(36);
  return `dm_${a.slice(0, 8)}_${b.slice(0, 8)}_${ts}`;
}

export function makeGroupRoomName(groupId: string, callerId: string): string {
  const ts = Date.now().toString(36);
  return `gr_${groupId.slice(0, 8)}_${callerId.slice(0, 6)}_${ts}`;
}

/** Returns true if the two users are accepted friends. Both args are auth user ids. */
export async function areAuthUsersFriends(
  authA: string,
  authB: string
): Promise<boolean> {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id')
    .in('user_id', [authA, authB]);

  const profA = profiles?.find((p) => p.user_id === authA)?.id;
  const profB = profiles?.find((p) => p.user_id === authB)?.id;
  if (!profA || !profB) return false;

  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(user_id.eq.${profA},friend_id.eq.${profB}),and(user_id.eq.${profB},friend_id.eq.${profA})`
    )
    .limit(1);

  if (error) return false;
  return Boolean(data && data.length > 0);
}

/** True if `authUserId` is currently a member of `groupId`. */
export async function isGroupMember(authUserId: string, groupId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', authUserId)
    .maybeSingle();
  return Boolean(!error && data);
}

/** Resolve display name for push notifications. */
export async function resolveDisplayName(authUserId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('display_name, email')
    .eq('user_id', authUserId)
    .maybeSingle();
  return (
    data?.display_name?.trim() ||
    data?.email?.split('@')[0] ||
    'Someone'
  );
}

export const MAX_CALL_PARTICIPANTS = 10;

/** Count participants still invited or in the call. */
export async function countActiveParticipants(callId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('call_participants')
    .select('id', { count: 'exact', head: true })
    .eq('call_id', callId)
    .in('state', ['invited', 'joined']);
  if (error) return 0;
  return count ?? 0;
}

/** True if user is currently joined in the call. */
export async function isJoinedParticipant(
  callId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('call_participants')
    .select('id')
    .eq('call_id', callId)
    .eq('user_id', userId)
    .eq('state', 'joined')
    .maybeSingle();
  return Boolean(data);
}
