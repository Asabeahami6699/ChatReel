import { Router } from 'express';
import { z } from 'zod';
import { isLiveKitConfigured } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';
import {
  areAuthUsersFriends,
  countActiveParticipants,
  createLiveKitToken,
  isGroupMember,
  isJoinedParticipant,
  makeDirectRoomName,
  makeGroupRoomName,
  MAX_CALL_PARTICIPANTS,
  resolveDisplayName,
  type CallRow,
} from '../services/calls.service';
import { sendPushToUserSafe } from '../services/push.service';

const router = Router();

/* -------------------------------------------------------------------------- */
/*  GET /config — does the server know how to make calls?                     */
/* -------------------------------------------------------------------------- */
router.get(
  '/config',
  requireAuth,
  asyncHandler(async (_req: AuthedRequest, res) => {
    return res.json({ enabled: isLiveKitConfigured() });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /  — start a 1:1 (direct) or group call                              */
/*    body: { type: 'voice'|'video', callee_id?, group_id? }                  */
/*    The caller is added as a participant in 'joined' state immediately;     */
/*    the callee starts as 'invited' and gets a push.                         */
/* -------------------------------------------------------------------------- */
const startSchema = z
  .object({
    type: z.enum(['voice', 'video']).default('voice'),
    callee_id: z.string().uuid().optional(),
    group_id: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.callee_id) !== Boolean(v.group_id), {
    message: 'Provide exactly one of callee_id or group_id',
  });

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!isLiveKitConfigured()) {
      return res.status(503).json({ error: 'Calls are not enabled on this server' });
    }
    const body = startSchema.parse(req.body);
    const callerId = req.userId!;

    let scope: 'direct' | 'group';
    let roomName: string;

    if (body.callee_id) {
      if (body.callee_id === callerId) {
        return res.status(400).json({ error: 'Cannot call yourself' });
      }
      const { data: calleeProfile, error: calleeErr } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('user_id', body.callee_id)
        .maybeSingle();
      if (calleeErr) return res.status(500).json({ error: calleeErr.message });
      if (!calleeProfile) {
        return res.status(404).json({ error: 'User not found' });
      }
      const friends = await areAuthUsersFriends(callerId, body.callee_id);
      if (!friends) {
        return res.status(403).json({ error: 'You can only call accepted friends' });
      }
      scope = 'direct';
      roomName = makeDirectRoomName(callerId, body.callee_id);
    } else {
      const member = await isGroupMember(callerId, body.group_id!);
      if (!member) {
        return res.status(403).json({ error: 'You are not a member of that group' });
      }
      scope = 'group';
      roomName = makeGroupRoomName(body.group_id!, callerId);
    }

    const insertRow: Partial<CallRow> = {
      room_name: roomName,
      call_type: body.type,
      scope,
      caller_id: callerId,
      callee_id: body.callee_id ?? null,
      group_id: body.group_id ?? null,
      status: 'ringing',
    };

    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .insert(insertRow)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Caller participant
    await supabaseAdmin.from('call_participants').insert({
      call_id: call.id,
      user_id: callerId,
      state: 'joined',
      joined_at: new Date().toISOString(),
    });

    // Invitees
    let inviteeAuthIds: string[] = [];
    if (scope === 'direct') {
      inviteeAuthIds = [body.callee_id!];
    } else {
      const { data: members } = await supabaseAdmin
        .from('group_members')
        .select('user_id')
        .eq('group_id', body.group_id!);
      inviteeAuthIds = (members ?? [])
        .map((m) => m.user_id as string)
        .filter((id) => id !== callerId);
    }

    if (inviteeAuthIds.length > 0) {
      await supabaseAdmin
        .from('call_participants')
        .insert(
          inviteeAuthIds.map((uid) => ({
            call_id: call.id,
            user_id: uid,
            state: 'invited' as const,
          }))
        );

      // Push notification (best effort)
      const callerName = await resolveDisplayName(callerId);
      const title = body.type === 'video' ? '📹 Video call' : '📞 Voice call';
      const pushBody =
        scope === 'direct'
          ? `${callerName} is calling`
          : `${callerName} started a group call`;
      for (const uid of inviteeAuthIds) {
        sendPushToUserSafe(uid, {
          title,
          body: pushBody,
          data: {
            type: 'incoming_call',
            call_id: call.id,
            call_type: body.type,
            scope,
            caller_id: callerId,
            room_name: roomName,
          },
        });
      }
    }

    // Mint a token for the caller right away.
    const callerName = await resolveDisplayName(callerId);
    const liveKit = await createLiveKitToken({
      userId: callerId,
      identity: callerId,
      displayName: callerName,
      roomName,
    });

    return res.status(201).json({
      call,
      live_kit: liveKit,
    });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /:id/accept — callee/invitee accepts; mint a token, mark joined      */
/* -------------------------------------------------------------------------- */
router.post(
  '/:id/accept',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!call) return res.status(404).json({ error: 'Call not found' });

    if (call.scope === 'direct') {
      if (call.caller_id === userId) {
        return res.status(403).json({ error: 'Caller cannot accept their own call' });
      }
      if (call.callee_id !== userId) {
        return res.status(403).json({ error: 'This call is not for you' });
      }
    }

    // Terminal states cannot be joined. Already-accepted is OK (idempotent rejoin /
    // double-tap after the first accept succeeded / mid-call invite).
    if (!['ringing', 'accepted'].includes(call.status)) {
      return res.status(409).json({ error: 'Call is no longer active' });
    }

    // Authorisation: must be invited (or already joined for reconnect).
    const { data: participant } = await supabaseAdmin
      .from('call_participants')
      .select('id, state')
      .eq('call_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!participant) {
      // Allow group members to join even without an invite row.
      if (call.scope !== 'group' || !(await isGroupMember(userId, call.group_id))) {
        return res.status(403).json({ error: 'Not allowed' });
      }
      await supabaseAdmin.from('call_participants').insert({
        call_id: id,
        user_id: userId,
        state: 'joined',
        joined_at: new Date().toISOString(),
      });
    } else if (participant.state === 'declined') {
      return res.status(403).json({ error: 'Not allowed to accept this call' });
    } else if (participant.state !== 'joined') {
      await supabaseAdmin
        .from('call_participants')
        .update({ state: 'joined', joined_at: new Date().toISOString() })
        .eq('id', participant.id);
    }

    // Move call to 'accepted' if still ringing.
    if (call.status === 'ringing') {
      await supabaseAdmin
        .from('calls')
        .update({
          status: 'accepted',
          started_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'ringing');
    }

    const { data: freshCall } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const displayName = await resolveDisplayName(userId);
    const liveKit = await createLiveKitToken({
      userId,
      identity: userId,
      displayName,
      roomName: (freshCall ?? call).room_name,
    });

    return res.json({ call: freshCall ?? call, live_kit: liveKit });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /:id/decline — callee declines (direct call) or skips (group)        */
/* -------------------------------------------------------------------------- */
router.post(
  '/:id/decline',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: call } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!call) return res.status(404).json({ error: 'Call not found' });

    await supabaseAdmin
      .from('call_participants')
      .update({ state: 'declined' })
      .eq('call_id', id)
      .eq('user_id', userId);

    if (call.scope === 'direct' && call.callee_id === userId && call.status === 'ringing') {
      await supabaseAdmin.from('calls').update({ status: 'declined' }).eq('id', id);
    }

    return res.json({ success: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /:id/end — leave (group) or end (direct)                             */
/* -------------------------------------------------------------------------- */
router.post(
  '/:id/end',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: call } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!call) return res.status(404).json({ error: 'Call not found' });

    // Mark this participant as left
    await supabaseAdmin
      .from('call_participants')
      .update({ state: 'left', left_at: new Date().toISOString() })
      .eq('call_id', id)
      .eq('user_id', userId);

    // For direct calls: end immediately when caller or callee leaves.
    if (call.scope === 'direct') {
      if (call.status === 'ringing' && call.caller_id === userId) {
        // caller cancelled before pickup
        await supabaseAdmin.from('calls').update({ status: 'cancelled' }).eq('id', id);
      } else if (
        call.status === 'accepted' ||
        call.status === 'ringing' /* fallback */
      ) {
        await supabaseAdmin.from('calls').update({ status: 'ended' }).eq('id', id);
      }
      return res.json({ success: true });
    }

    // Group call: end only when no participants remain in 'joined' state.
    const { count } = await supabaseAdmin
      .from('call_participants')
      .select('id', { count: 'exact', head: true })
      .eq('call_id', id)
      .eq('state', 'joined');
    if (!count || count === 0) {
      await supabaseAdmin
        .from('calls')
        .update({ status: 'ended' })
        .eq('id', id)
        .neq('status', 'ended');
    }
    return res.json({ success: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /:id/no-answer — caller timed out while ringing (direct calls)       */
/* -------------------------------------------------------------------------- */
router.post(
  '/:id/no-answer',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: call } = await supabaseAdmin
      .from('calls')
      .select('id, status, caller_id, callee_id, scope')
      .eq('id', id)
      .maybeSingle();
    if (!call) return res.status(404).json({ error: 'Call not found' });

    if (call.status !== 'ringing') {
      return res.json({ success: true });
    }

    if (call.scope === 'direct' && call.caller_id === userId) {
      await supabaseAdmin.from('calls').update({ status: 'missed' }).eq('id', id);
      if (call.callee_id) {
        await supabaseAdmin
          .from('call_participants')
          .update({ state: 'missed' })
          .eq('call_id', id)
          .eq('user_id', call.callee_id);
      }
      await supabaseAdmin
        .from('call_participants')
        .update({ state: 'left', left_at: new Date().toISOString() })
        .eq('call_id', id)
        .eq('user_id', userId);
    }

    return res.json({ success: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /:id/missed — client signals it auto-rejected (callee app closed     */
/*    the ring screen without action). Only valid when call still ringing.    */
/* -------------------------------------------------------------------------- */
router.post(
  '/:id/missed',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: call } = await supabaseAdmin
      .from('calls')
      .select('id, status, callee_id, scope')
      .eq('id', id)
      .maybeSingle();
    if (!call) return res.status(404).json({ error: 'Call not found' });

    if (call.status !== 'ringing') {
      return res.json({ success: true });
    }

    await supabaseAdmin
      .from('call_participants')
      .update({ state: 'missed' })
      .eq('call_id', id)
      .eq('user_id', userId);

    if (call.scope === 'direct' && call.callee_id === userId) {
      await supabaseAdmin.from('calls').update({ status: 'missed' }).eq('id', id);
    }
    return res.json({ success: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /history — recent calls involving me                                  */
/* -------------------------------------------------------------------------- */
router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const limit = Math.min(Number(req.query.limit ?? 50), 100);

    // Calls where I'm caller, callee, or a participant.
    const [{ data: byPair }, { data: byParticipant }] = await Promise.all([
      supabaseAdmin
        .from('calls')
        .select('*')
        .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('call_participants')
        .select('call:calls(*)')
        .eq('user_id', userId)
        .limit(limit),
    ]);

    const all = new Map<string, CallRow>();
    for (const c of (byPair ?? []) as CallRow[]) all.set(c.id, c);
    for (const row of byParticipant ?? []) {
      const c = (row as { call: CallRow | CallRow[] | null }).call;
      const flat = Array.isArray(c) ? c[0] : c;
      if (flat) all.set(flat.id, flat);
    }
    const calls = Array.from(all.values()).sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1
    );

    // Enrich with the "other party" profile (for direct calls) or group name.
    const otherUserIds = new Set<string>();
    const groupIds = new Set<string>();
    for (const c of calls) {
      if (c.scope === 'direct') {
        const other = c.caller_id === userId ? c.callee_id : c.caller_id;
        if (other) otherUserIds.add(other);
      } else if (c.group_id) {
        groupIds.add(c.group_id);
      }
    }

    const [{ data: peers }, { data: groups }] = await Promise.all([
      otherUserIds.size > 0
        ? supabaseAdmin
            .from('profiles')
            .select('user_id, display_name, email, avatar_url')
            .in('user_id', Array.from(otherUserIds))
        : Promise.resolve({ data: [] }),
      groupIds.size > 0
        ? supabaseAdmin
            .from('groups')
            .select('id, name, avatar_url')
            .in('id', Array.from(groupIds))
        : Promise.resolve({ data: [] }),
    ]);

    const peerByAuth = new Map<string, { display_name: string | null; email: string | null; avatar_url: string | null }>();
    for (const p of (peers ?? []) as Array<{ user_id: string; display_name: string | null; email: string | null; avatar_url: string | null }>) {
      peerByAuth.set(p.user_id, {
        display_name: p.display_name,
        email: p.email,
        avatar_url: p.avatar_url,
      });
    }
    const groupById = new Map<string, { name: string; avatar_url: string | null }>();
    for (const g of (groups ?? []) as Array<{ id: string; name: string; avatar_url: string | null }>) {
      groupById.set(g.id, { name: g.name, avatar_url: g.avatar_url });
    }

    const enriched = calls.map((c) => {
      const direction =
        c.scope === 'direct'
          ? c.caller_id === userId
            ? 'outgoing'
            : 'incoming'
          : 'outgoing';
      const otherUserId = c.scope === 'direct'
        ? c.caller_id === userId
          ? c.callee_id
          : c.caller_id
        : null;
      const peer = otherUserId ? peerByAuth.get(otherUserId) ?? null : null;
      const group = c.group_id ? groupById.get(c.group_id) ?? null : null;
      return {
        ...c,
        direction,
        peer,
        group,
      };
    });

    return res.json({ calls: enriched });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /incoming — latest ringing call targeting the authenticated user       */
/* -------------------------------------------------------------------------- */
router.get(
  '/incoming',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;

    const [{ data: direct }, { data: invitedRows }] = await Promise.all([
      supabaseAdmin
        .from('calls')
        .select('*')
        .eq('status', 'ringing')
        .eq('scope', 'direct')
        .eq('callee_id', userId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabaseAdmin
        .from('call_participants')
        .select('call:calls(*)')
        .eq('user_id', userId)
        .eq('state', 'invited')
        .limit(10),
    ]);

    const candidates: CallRow[] = [];
    if (direct?.[0]) candidates.push(direct[0] as CallRow);
    for (const row of invitedRows ?? []) {
      const raw = (row as { call: CallRow | CallRow[] | null }).call;
      const c = Array.isArray(raw) ? raw[0] : raw;
      if (c && (c.status === 'ringing' || c.status === 'accepted')) candidates.push(c);
    }

    const unique = new Map<string, CallRow>();
    for (const c of candidates) unique.set(c.id, c);
    const sorted = Array.from(unique.values()).sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1
    );

    return res.json({ call: sorted[0] ?? null });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /active — ongoing call for a group (or any call I'm in)               */
/* -------------------------------------------------------------------------- */
router.get(
  '/active',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const groupId = req.query.group_id
      ? z.string().uuid().parse(req.query.group_id)
      : null;

    let query = supabaseAdmin
      .from('calls')
      .select('*')
      .in('status', ['ringing', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (groupId) {
      query = query.eq('group_id', groupId).eq('scope', 'group');
    }

    const { data: calls, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    for (const call of (calls ?? []) as CallRow[]) {
      const { count: joinedCount } = await supabaseAdmin
        .from('call_participants')
        .select('id', { count: 'exact', head: true })
        .eq('call_id', call.id)
        .eq('state', 'joined');

      if (!joinedCount || joinedCount === 0) continue;

      if (groupId) {
        const member = await isGroupMember(userId, groupId);
        if (member) {
          const { data: part } = await supabaseAdmin
            .from('call_participants')
            .select('state')
            .eq('call_id', call.id)
            .eq('user_id', userId)
            .maybeSingle();
          return res.json({
            call,
            my_state: part?.state ?? null,
            joined_count: joinedCount,
          });
        }
      } else {
        const { data: part } = await supabaseAdmin
          .from('call_participants')
          .select('state')
          .eq('call_id', call.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (part && ['invited', 'joined'].includes(part.state)) {
          return res.json({
            call,
            my_state: part.state,
            joined_count: joinedCount,
          });
        }
      }
    }

    return res.json({ call: null, my_state: null, joined_count: 0 });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /:id/invite — add participants mid-call (up to MAX_CALL_PARTICIPANTS)  */
/* -------------------------------------------------------------------------- */
const inviteSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(MAX_CALL_PARTICIPANTS),
});

router.post(
  '/:id/invite',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const { user_ids } = inviteSchema.parse(req.body);

    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!call) return res.status(404).json({ error: 'Call not found' });

    if (!['ringing', 'accepted'].includes(call.status)) {
      return res.status(409).json({ error: 'Call is no longer active' });
    }

    const joined = await isJoinedParticipant(id, userId);
    if (!joined && call.caller_id !== userId) {
      return res.status(403).json({ error: 'Only active participants can invite others' });
    }

    const activeCount = await countActiveParticipants(id);
    const uniqueNew = [...new Set(user_ids)].filter((uid) => uid !== userId);

    const { data: existing } = await supabaseAdmin
      .from('call_participants')
      .select('user_id, state')
      .eq('call_id', id);
    const existingIds = new Set(
      (existing ?? [])
        .filter((p) => !['left', 'declined', 'missed'].includes(p.state as string))
        .map((p) => p.user_id as string)
    );

    const toInvite = uniqueNew.filter((uid) => !existingIds.has(uid));
    if (toInvite.length === 0) {
      return res.json({ invited: [], message: 'All users already in the call' });
    }

    if (activeCount + toInvite.length > MAX_CALL_PARTICIPANTS) {
      return res.status(400).json({
        error: `Call supports up to ${MAX_CALL_PARTICIPANTS} participants (${activeCount} already active)`,
      });
    }

    // Validate each invitee: friend of inviter, or same group member.
    for (const uid of toInvite) {
      if (call.scope === 'group' && call.group_id) {
        const member = await isGroupMember(uid, call.group_id);
        if (!member) {
          return res.status(403).json({ error: 'User is not in this group' });
        }
      } else {
        const friends = await areAuthUsersFriends(userId, uid);
        if (!friends) {
          return res.status(403).json({ error: 'You can only invite accepted friends' });
        }
      }
    }

    await supabaseAdmin.from('call_participants').insert(
      toInvite.map((uid) => ({
        call_id: id,
        user_id: uid,
        state: 'invited' as const,
      }))
    );

    // Mark multi-party when more than 2 people are involved.
    const newTotal = activeCount + toInvite.length;
    if (newTotal > 2 && call.metadata?.multi_party !== true) {
      await supabaseAdmin
        .from('calls')
        .update({
          metadata: { ...(call.metadata as object), multi_party: true },
        })
        .eq('id', id);
    }

    const callerName = await resolveDisplayName(userId);
    const title = call.call_type === 'video' ? '📹 Video call' : '📞 Voice call';
    for (const uid of toInvite) {
      sendPushToUserSafe(uid, {
        title,
        body: `${callerName} invited you to join a call`,
        data: {
          type: 'incoming_call',
          call_id: id,
          call_type: call.call_type,
          scope: call.scope,
          caller_id: call.caller_id,
          room_name: call.room_name,
        },
      });
    }

    return res.json({ invited: toInvite });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /:id/participants — list call participants with profile info          */
/* -------------------------------------------------------------------------- */
router.get(
  '/:id/participants',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: call } = await supabaseAdmin
      .from('calls')
      .select('id, caller_id, callee_id, group_id, scope')
      .eq('id', id)
      .maybeSingle();
    if (!call) return res.status(404).json({ error: 'Call not found' });

    const { data: parts, error } = await supabaseAdmin
      .from('call_participants')
      .select('user_id, state, joined_at')
      .eq('call_id', id)
      .in('state', ['invited', 'joined']);
    if (error) return res.status(500).json({ error: error.message });

    const userIds = (parts ?? []).map((p) => p.user_id as string);
    const allowed =
      call.caller_id === userId ||
      call.callee_id === userId ||
      userIds.includes(userId) ||
      (call.group_id && (await isGroupMember(userId, call.group_id)));
    if (!allowed) return res.status(403).json({ error: 'Not allowed' });

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, email, avatar_url')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

    const profileByUser = new Map(
      (profiles ?? []).map((p) => [p.user_id as string, p])
    );

    const participants = (parts ?? []).map((p) => {
      const prof = profileByUser.get(p.user_id as string);
      return {
        user_id: p.user_id,
        state: p.state,
        joined_at: p.joined_at,
        display_name:
          prof?.display_name?.trim() ||
          prof?.email?.split('@')[0] ||
          'Unknown',
        avatar_url: prof?.avatar_url ?? null,
      };
    });

    return res.json({ participants });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /:id — fetch single call (for refreshing post-accept etc.)            */
/* -------------------------------------------------------------------------- */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!call) return res.status(404).json({ error: 'Call not found' });

    const isCaller = call.caller_id === userId;
    const isCallee = call.callee_id === userId;
    const isMember =
      call.scope === 'group' && call.group_id
        ? await isGroupMember(userId, call.group_id)
        : false;

    if (!isCaller && !isCallee && !isMember) {
      const { data: part } = await supabaseAdmin
        .from('call_participants')
        .select('id')
        .eq('call_id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!part) return res.status(403).json({ error: 'Not allowed' });
    }

    return res.json({ call });
  })
);

export default router;
