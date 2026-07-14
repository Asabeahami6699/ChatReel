import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
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

function liveKitHttpHost(url: string): string {
  return url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

export function getLiveKitRoomService(): RoomServiceClient {
  if (!isLiveKitConfigured()) {
    throw new Error('LiveKit is not configured on the server');
  }
  return new RoomServiceClient(
    liveKitHttpHost(env.liveKit.url),
    env.liveKit.apiKey,
    env.liveKit.apiSecret
  );
}

/** Force-mute a participant's published mic tracks (host moderation). */
export async function muteParticipantInRoom(roomName: string, identity: string): Promise<void> {
  const svc = getLiveKitRoomService();
  const participant = await svc.getParticipant(roomName, identity);
  const tracks = participant.tracks ?? [];
  for (const track of tracks) {
    const sid = track.sid;
    if (!sid) continue;
    // 1 = AUDIO in LiveKit protocol TrackType
    const isAudio = Number(track.type) === 1 || String(track.type).toLowerCase().includes('audio');
    if (!isAudio) continue;
    await svc.mutePublishedTrack(roomName, identity, sid, true);
  }
  try {
    await svc.updateParticipant(roomName, identity, {
      permission: {
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
      },
    });
  } catch {
    /* mute tracks is enough if permission update fails on older servers */
  }
}

export async function removeParticipantFromRoom(roomName: string, identity: string): Promise<void> {
  const svc = getLiveKitRoomService();
  await svc.removeParticipant(roomName, identity);
}

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

/**
 * Find a call where this user is actively joined (not merely invited).
 * Ignores stale ringing rows older than ~2 minutes so abandoned rings
 * cannot permanently block placing new calls.
 * Accepted calls older than ~8 minutes are also treated as stale (orphaned
 * after reload / disconnect without hangup).
 */
export async function findUserBusyCall(userId: string): Promise<CallRow | null> {
  const { data: parts } = await supabaseAdmin
    .from('call_participants')
    .select('call_id, state')
    .eq('user_id', userId)
    .eq('state', 'joined')
    .limit(20);

  if (!parts?.length) return null;

  const callIds = parts.map((p) => p.call_id as string);
  const { data: calls } = await supabaseAdmin
    .from('calls')
    .select('*')
    .in('id', callIds)
    .in('status', ['ringing', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(10);

  const RINGING_FRESH_MS = 120_000;
  const ACCEPTED_FRESH_MS = 8 * 60 * 1000;
  const now = Date.now();
  for (const row of calls ?? []) {
    const c = row as CallRow;
    const created = new Date(c.created_at).getTime();
    const age = now - created;
    if (!Number.isFinite(age)) continue;
    if (c.status === 'accepted' && age < ACCEPTED_FRESH_MS) return c;
    if (c.status === 'ringing' && age < RINGING_FRESH_MS) return c;
  }
  return null;
}

/** Clear a user's joined row; end the call if direct / last participant. */
export async function releaseUserFromCall(callId: string, userId: string): Promise<void> {
  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('id', callId)
    .maybeSingle();
  if (!call) return;

  await supabaseAdmin
    .from('call_participants')
    .update({ state: 'left', left_at: new Date().toISOString() })
    .eq('call_id', callId)
    .eq('user_id', userId)
    .in('state', ['joined', 'held']);

  if (call.scope === 'direct') {
    if (call.status === 'ringing' || call.status === 'accepted') {
      await supabaseAdmin
        .from('calls')
        .update({
          status: call.status === 'ringing' && call.caller_id === userId ? 'cancelled' : 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId)
        .in('status', ['ringing', 'accepted']);
    }
    return;
  }

  const { count } = await supabaseAdmin
    .from('call_participants')
    .select('id', { count: 'exact', head: true })
    .eq('call_id', callId)
    .eq('state', 'joined');
  if (!count) {
    await supabaseAdmin
      .from('calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', callId)
      .neq('status', 'ended');
  }
}

/** Clear joined (and optionally held) sessions so the user can place a new call. */
export async function clearOwnBusyCalls(
  userId: string,
  opts?: { includeHeld?: boolean }
): Promise<number> {
  const states = opts?.includeHeld === false ? ['joined'] : ['joined', 'held'];
  const { data: parts } = await supabaseAdmin
    .from('call_participants')
    .select('call_id, state')
    .eq('user_id', userId)
    .in('state', states)
    .limit(20);
  if (!parts?.length) return 0;

  const callIds = [...new Set(parts.map((p) => p.call_id as string))];
  const { data: calls } = await supabaseAdmin
    .from('calls')
    .select('id, status')
    .in('id', callIds)
    .in('status', ['ringing', 'accepted']);

  let cleared = 0;
  for (const c of calls ?? []) {
    await releaseUserFromCall(c.id as string, userId);
    cleared += 1;
  }
  return cleared;
}

/** Put the local user on hold for a call (stay accepted; leave LiveKit). */
export async function holdUserOnCall(callId: string, userId: string): Promise<CallRow | null> {
  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('id', callId)
    .maybeSingle();
  if (!call) return null;
  if (!['ringing', 'accepted'].includes(call.status)) {
    throw new Error('Call is not active');
  }

  const { data: part } = await supabaseAdmin
    .from('call_participants')
    .select('id, state')
    .eq('call_id', callId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!part || (part.state !== 'joined' && part.state !== 'held')) {
    throw new Error('Not in this call');
  }

  await supabaseAdmin
    .from('call_participants')
    .update({ state: 'held', held_at: new Date().toISOString() })
    .eq('id', part.id);

  try {
    await removeParticipantFromRoom(call.room_name, userId);
  } catch {
    /* room may already be empty locally */
  }

  return call as CallRow;
}

/** Resume a held call: mark joined and mint a fresh LiveKit token. */
export async function resumeUserOnCall(
  callId: string,
  userId: string
): Promise<{ call: CallRow; liveKit: { token: string; url: string; expiresAt: string } }> {
  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('id', callId)
    .maybeSingle();
  if (!call) throw new Error('Call not found');
  if (!['ringing', 'accepted'].includes(call.status)) {
    throw new Error('Call is no longer active');
  }

  const { data: part } = await supabaseAdmin
    .from('call_participants')
    .select('id, state')
    .eq('call_id', callId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!part) throw new Error('Not in this call');
  if (part.state === 'left' || part.state === 'declined' || part.state === 'missed') {
    throw new Error('Cannot resume this call');
  }

  await supabaseAdmin
    .from('call_participants')
    .update({
      state: 'joined',
      held_at: null,
      joined_at: new Date().toISOString(),
    })
    .eq('id', part.id);

  const displayName = await resolveDisplayName(userId);
  const liveKit = await createLiveKitToken({
    userId,
    identity: userId,
    displayName,
    roomName: call.room_name,
  });
  return { call: call as CallRow, liveKit };
}

/** Answer a waiting call while already on another — hold current, accept waiting. */
export async function answerWaitingCall(
  waitingCallId: string,
  userId: string
): Promise<{
  held_call: CallRow | null;
  call: CallRow;
  live_kit: { token: string; url: string; expiresAt: string };
}> {
  const busy = await findUserBusyCall(userId);
  let held: CallRow | null = null;
  if (busy && busy.id !== waitingCallId) {
    held = await holdUserOnCall(busy.id, userId);
  }

  const { data: call } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('id', waitingCallId)
    .maybeSingle();
  if (!call) throw new Error('Waiting call not found');
  if (!['ringing', 'accepted'].includes(call.status)) {
    throw new Error('Waiting call is no longer active');
  }

  if (call.scope === 'direct') {
    if (call.callee_id !== userId) throw new Error('This call is not for you');
  }

  const { data: participant } = await supabaseAdmin
    .from('call_participants')
    .select('id, state')
    .eq('call_id', waitingCallId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!participant) {
    if (call.scope !== 'group' || !(await isGroupMember(userId, call.group_id!))) {
      throw new Error('Not allowed');
    }
    await supabaseAdmin.from('call_participants').insert({
      call_id: waitingCallId,
      user_id: userId,
      state: 'joined',
      joined_at: new Date().toISOString(),
    });
  } else if (participant.state === 'declined') {
    throw new Error('Not allowed to accept this call');
  } else {
    await supabaseAdmin
      .from('call_participants')
      .update({ state: 'joined', joined_at: new Date().toISOString(), held_at: null })
      .eq('id', participant.id);
  }

  if (call.status === 'ringing') {
    await supabaseAdmin
      .from('calls')
      .update({ status: 'accepted', started_at: new Date().toISOString() })
      .eq('id', waitingCallId)
      .eq('status', 'ringing');
  }

  const { data: freshCall } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('id', waitingCallId)
    .maybeSingle();

  const displayName = await resolveDisplayName(userId);
  const liveKit = await createLiveKitToken({
    userId,
    identity: userId,
    displayName,
    roomName: (freshCall ?? call).room_name,
  });

  return {
    held_call: held,
    call: (freshCall ?? call) as CallRow,
    live_kit: liveKit,
  };
}

/** Switch: hold current active, resume the held call. */
export async function switchHeldCall(
  fromCallId: string,
  toCallId: string,
  userId: string
): Promise<{
  held_call: CallRow;
  call: CallRow;
  live_kit: { token: string; url: string; expiresAt: string };
}> {
  if (fromCallId === toCallId) throw new Error('Already on that call');
  await holdUserOnCall(fromCallId, userId);
  const { call, liveKit } = await resumeUserOnCall(toCallId, userId);
  const { data: heldRow } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('id', fromCallId)
    .maybeSingle();
  return {
    held_call: (heldRow as CallRow) ?? ({ id: fromCallId } as CallRow),
    call,
    live_kit: liveKit,
  };
}
