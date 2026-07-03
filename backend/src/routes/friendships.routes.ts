import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, getProfileIdByUserId, requireAuth } from '../middleware/auth';
import {
  getAuthUserIdByProfileId,
  sendPushToUserSafe,
} from '../services/push.service';

const router = Router();

router.get(
  '/requests',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const [incomingRes, outgoingRes] = await Promise.all([
      supabaseAdmin
        .from('friendships')
        .select(`
          id, user_id, created_at,
          profiles!friendships_user_id_fkey(id, display_name, email, avatar_url)
        `)
        .eq('friend_id', profileId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('friendships')
        .select(`
          id, friend_id, created_at,
          profiles!friendships_friend_id_fkey(id, display_name, email, avatar_url)
        `)
        .eq('user_id', profileId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (incomingRes.error) return res.status(500).json({ error: incomingRes.error.message });
    if (outgoingRes.error) return res.status(500).json({ error: outgoingRes.error.message });

    const incoming =
      incomingRes.data?.map((f: Record<string, unknown>) => {
        const p = f.profiles as { display_name?: string; email?: string; avatar_url?: string } | null;
        return {
          friendshipId: f.id,
          id: f.user_id,
          display_name: p?.display_name || p?.email || 'Unknown',
          email: p?.email || '',
          avatar_url: p?.avatar_url,
          status: 'pending',
          created_at: f.created_at,
        };
      }) ?? [];

    const outgoing =
      outgoingRes.data?.map((f: Record<string, unknown>) => {
        const p = f.profiles as { display_name?: string; email?: string; avatar_url?: string } | null;
        return {
          friendshipId: f.id,
          id: f.friend_id,
          display_name: p?.display_name || p?.email || 'Unknown',
          email: p?.email || '',
          avatar_url: p?.avatar_url,
          status: 'pending',
          created_at: f.created_at,
        };
      }) ?? [];

    return res.json({ incoming, outgoing, profile_id: profileId });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const status = req.query.status as string | undefined;

    let query = supabaseAdmin
      .from('friendships')
      .select(`
        id, user_id, friend_id, status, created_at, updated_at,
        sender_profile:profiles!friendships_user_id_fkey (id, user_id, display_name, email, avatar_url),
        receiver_profile:profiles!friendships_friend_id_fkey (id, user_id, display_name, email, avatar_url)
      `)
      .or(`user_id.eq.${profileId},friend_id.eq.${profileId}`);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ friendships: data ?? [] });
  })
);

router.post(
  '/request',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { friend_profile_id } = z.object({ friend_profile_id: z.string().uuid() }).parse(req.body);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });
    if (profileId === friend_profile_id) {
      return res.status(400).json({ error: "You can't add yourself" });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('friendships')
      .insert({
        user_id: profileId,
        friend_id: friend_profile_id,
        status: 'pending',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const [{ data: senderProfile }, recipientUserId] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('display_name, email')
        .eq('id', profileId)
        .maybeSingle(),
      getAuthUserIdByProfileId(friend_profile_id),
    ]);

    if (recipientUserId) {
      const senderName =
        senderProfile?.display_name || senderProfile?.email?.split('@')[0] || 'Someone';
      sendPushToUserSafe(recipientUserId, {
        title: 'New friend request',
        body: `${senderName} sent you a friend request`,
        data: { type: 'friend_request', friendship_id: data.id },
      });
    }

    return res.status(201).json({ friendship: data });
  })
);

router.patch(
  '/:id/accept',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: friendship, error: fetchError } = await supabaseAdmin
      .from('friendships')
      .select('*')
      .eq('id', req.params.id)
      .eq('friend_id', profileId)
      .single();

    if (fetchError || !friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('friendships')
      .update({ status: 'accepted', updated_at: now })
      .eq('id', friendship.id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    const { error: insertError } = await supabaseAdmin.from('friendships').insert({
      user_id: profileId,
      friend_id: friendship.user_id,
      status: 'accepted',
      created_at: now,
      updated_at: now,
    });

    if (insertError && !insertError.message.includes('duplicate')) {
      return res.status(500).json({ error: insertError.message });
    }

    const [{ data: accepterProfile }, requesterUserId] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('display_name, email')
        .eq('id', profileId)
        .maybeSingle(),
      getAuthUserIdByProfileId(friendship.user_id as string),
    ]);

    if (requesterUserId) {
      const accepterName =
        accepterProfile?.display_name || accepterProfile?.email?.split('@')[0] || 'Someone';
      sendPushToUserSafe(requesterUserId, {
        title: 'Friend request accepted',
        body: `${accepterName} accepted your friend request`,
        data: { type: 'friend_accepted', friendship_id: friendship.id },
      });
    }

    return res.json({ success: true });
  })
);

router.patch(
  '/:id/reject',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { error } = await supabaseAdmin
      .from('friendships')
      .update({ status: 'blocked', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('friend_id', profileId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.get(
  '/profile/:profileId/followers/count',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profileId = z.string().uuid().parse(req.params.profileId);
    const { count, error } = await supabaseAdmin
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('friend_id', profileId)
      .eq('status', 'accepted');

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ count: count ?? 0 });
  })
);

router.delete(
  '/with/:friendProfileId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const friendProfileId = z.string().uuid().parse(req.params.friendProfileId);
    if (friendProfileId === profileId) {
      return res.status(400).json({ error: 'Invalid friend' });
    }

    const { data: rows, error: fetchError } = await supabaseAdmin
      .from('friendships')
      .select('id')
      .or(
        `and(user_id.eq.${profileId},friend_id.eq.${friendProfileId}),and(user_id.eq.${friendProfileId},friend_id.eq.${profileId})`
      );

    if (fetchError) return res.status(500).json({ error: fetchError.message });
    const ids = (rows ?? []).map((r) => r.id as string);
    if (!ids.length) return res.json({ success: true });

    const { error } = await supabaseAdmin.from('friendships').delete().in('id', ids);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: friendship, error: fetchError } = await supabaseAdmin
      .from('friendships')
      .select('id, user_id, friend_id, status')
      .eq('id', req.params.id)
      .or(`user_id.eq.${profileId},friend_id.eq.${profileId}`)
      .maybeSingle();

    if (fetchError) return res.status(500).json({ error: fetchError.message });
    if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

    const idsToDelete = [friendship.id as string];

    if (friendship.status === 'accepted') {
      const { data: reciprocal } = await supabaseAdmin
        .from('friendships')
        .select('id')
        .eq('user_id', friendship.friend_id)
        .eq('friend_id', friendship.user_id)
        .eq('status', 'accepted')
        .maybeSingle();
      if (reciprocal?.id) idsToDelete.push(reciprocal.id as string);
    }

    const { error } = await supabaseAdmin.from('friendships').delete().in('id', idsToDelete);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.post(
  '/block',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const body = z.object({ user_id: z.string().uuid() }).parse(req.body);
    const { data: target } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('user_id', body.user_id)
      .maybeSingle();

    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === profileId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const { data: existing } = await supabaseAdmin
      .from('friendships')
      .select('id, user_id, friend_id, status')
      .or(
        `and(user_id.eq.${profileId},friend_id.eq.${target.id}),and(user_id.eq.${target.id},friend_id.eq.${profileId})`
      )
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from('friendships')
        .update({ status: 'blocked', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    const { error } = await supabaseAdmin.from('friendships').insert({
      user_id: profileId,
      friend_id: target.id,
      status: 'blocked',
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

export default router;
