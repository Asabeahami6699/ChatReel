import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';
import { getGroupDetails } from '../services/groupDetails.service';

const router = Router();

const createGroupSchema = z.object({
  name: z.string().min(1),
  member_user_ids: z.array(z.string().uuid()).default([]),
  avatar_url: z.string().optional(),
  description: z.string().optional(),
  is_public: z.boolean().optional(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;

    const [creatorRes, memberRes] = await Promise.all([
      supabaseAdmin
        .from('groups')
        .select('id, name, avatar_url, description, is_public, creator_id, created_at, updated_at')
        .eq('creator_id', userId),
      supabaseAdmin
        .from('group_members')
        .select('group_id, role, groups!inner(id, name, avatar_url, description, is_public, creator_id, created_at, updated_at)')
        .eq('user_id', userId),
    ]);

    if (creatorRes.error) return res.status(500).json({ error: creatorRes.error.message });
    if (memberRes.error) return res.status(500).json({ error: memberRes.error.message });

    const groupsMap = new Map<string, Record<string, unknown>>();

    (creatorRes.data ?? []).forEach((g) => {
      groupsMap.set(g.id, { ...g, user_role: 'creator' });
    });

    (memberRes.data ?? []).forEach((row) => {
      const raw = row.groups;
      const g = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
      if (g?.id && !groupsMap.has(g.id as string)) {
        groupsMap.set(g.id as string, {
          ...g,
          user_role: row.role === 'admin' ? 'admin' : 'member',
        });
      }
    });

    return res.json({ groups: Array.from(groupsMap.values()) });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createGroupSchema.parse(req.body);
    const userId = req.userId!;

    const { data: group, error: groupError } = await supabaseAdmin
      .from('groups')
      .insert({
        name: body.name.trim(),
        creator_id: userId,
        avatar_url: body.avatar_url,
        description: body.description,
        is_public: body.is_public ?? false,
      })
      .select()
      .single();

    if (groupError) return res.status(400).json({ error: groupError.message });

    const members = [
      { group_id: group.id, user_id: userId, role: 'admin' },
      ...body.member_user_ids
        .filter((id) => id !== userId)
        .map((id) => ({ group_id: group.id, user_id: id, role: 'member' })),
    ];

    const { error: membersError } = await supabaseAdmin.from('group_members').insert(members);
    if (membersError) return res.status(500).json({ error: membersError.message });

    const { data: invite } = await supabaseAdmin
      .from('group_invites')
      .insert({ group_id: group.id, created_by: userId })
      .select()
      .single();

    return res.status(201).json({ group, invite });
  })
);

router.get(
  '/:groupId/details',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const groupId = String(req.params.groupId);
      const details = await getGroupDetails(groupId);
      return res.json(details);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Group not found';
      return res.status(404).json({ error: message });
    }
  })
);

router.get(
  '/:groupId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data: group, error } = await supabaseAdmin
      .from('groups')
      .select('*')
      .eq('id', req.params.groupId)
      .single();

    if (error) return res.status(404).json({ error: 'Group not found' });
    return res.json({ group });
  })
);

router.get(
  '/:groupId/members',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('group_members')
      .select('id, group_id, user_id, role, joined_at')
      .eq('group_id', req.params.groupId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ members: data ?? [] });
  })
);

router.patch(
  '/:groupId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        avatar_url: z.string().optional(),
        is_public: z.boolean().optional(),
      })
      .parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('groups')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.groupId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ group: data });
  })
);

router.post(
  '/:groupId/invites',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await supabaseAdmin
      .from('group_invites')
      .insert({ group_id: req.params.groupId, created_by: req.userId! })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ invite: data });
  })
);

router.get(
  '/invites/:token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data: invite, error } = await supabaseAdmin
      .from('group_invites')
      .select('*')
      .eq('token', req.params.token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });

    const { data: group } = await supabaseAdmin
      .from('groups')
      .select('*')
      .eq('id', invite.group_id)
      .single();

    return res.json({ invite, group });
  })
);

router.post(
  '/invites/:token/join',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('group_invites')
      .select('*')
      .eq('token', req.params.token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    const { data: existing } = await supabaseAdmin
      .from('group_members')
      .select('id')
      .eq('group_id', invite.group_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.json({ group_id: invite.group_id, already_member: true });
    }

    const { error: memberError } = await supabaseAdmin.from('group_members').insert({
      group_id: invite.group_id,
      user_id: userId,
      role: 'member',
    });

    if (memberError) return res.status(500).json({ error: memberError.message });

    return res.json({ group_id: invite.group_id, already_member: false });
  })
);

router.patch(
  '/:groupId/invites/:inviteId/revoke',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin
      .from('group_invites')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', req.params.inviteId)
      .eq('group_id', req.params.groupId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.patch(
  '/:groupId/members/:memberId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { role } = z.object({ role: z.enum(['admin', 'member']) }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('group_members')
      .update({ role })
      .eq('id', req.params.memberId)
      .eq('group_id', req.params.groupId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ member: data });
  })
);

router.delete(
  '/:groupId/members/:memberId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin
      .from('group_members')
      .delete()
      .eq('id', req.params.memberId)
      .eq('group_id', req.params.groupId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.post(
  '/:groupId/members',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { user_ids } = z.object({ user_ids: z.array(z.string().uuid()).min(1) }).parse(req.body);

    const rows = user_ids.map((user_id) => ({
      group_id: req.params.groupId,
      user_id,
      role: 'member',
    }));

    const { error } = await supabaseAdmin.from('group_members').insert(rows);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ count: rows.length });
  })
);

router.post(
  '/:groupId/leave',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { error } = await supabaseAdmin
      .from('group_members')
      .delete()
      .eq('group_id', req.params.groupId)
      .eq('user_id', req.userId!);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

async function assertGroupMember(groupId: string, userId: string): Promise<boolean> {
  const { data: group } = await supabaseAdmin
    .from('groups')
    .select('creator_id')
    .eq('id', groupId)
    .maybeSingle();
  if (group?.creator_id === userId) return true;
  const { data: member } = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(member);
}

/** Distribute / refresh my group sender key to peers (encrypted per recipient). */
router.post(
  '/:groupId/sender-keys',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const groupId = z.string().uuid().parse(req.params.groupId);
    const userId = req.userId!;
    if (!(await assertGroupMember(groupId, userId))) {
      return res.status(403).json({ error: 'Not a group member' });
    }

    const body = z
      .object({
        distributions: z
          .array(
            z.object({
              recipient_id: z.string().uuid(),
              ciphertext: z.string().min(1),
              iv: z.string().min(1),
              sender_identity_pub: z.string().min(1),
            })
          )
          .min(1)
          .max(200),
      })
      .parse(req.body);

    const rows = body.distributions.map((d) => ({
      group_id: groupId,
      sender_id: userId,
      recipient_id: d.recipient_id,
      ciphertext: d.ciphertext,
      iv: d.iv,
      sender_identity_pub: d.sender_identity_pub,
      created_at: new Date().toISOString(),
    }));

    // Upsert per (group, sender, recipient)
    const { error } = await supabaseAdmin.from('group_sender_keys').upsert(rows, {
      onConflict: 'group_id,sender_id,recipient_id',
    });

    if (error) {
      // Table may not exist yet — surface a clear hint.
      return res.status(500).json({
        error: error.message,
        hint: 'Apply supabase/migrations/035_group_sender_keys.sql',
      });
    }
    return res.status(201).json({ count: rows.length });
  })
);

/** Fetch sender keys encrypted for me in this group. */
router.get(
  '/:groupId/sender-keys',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const groupId = z.string().uuid().parse(req.params.groupId);
    const userId = req.userId!;
    if (!(await assertGroupMember(groupId, userId))) {
      return res.status(403).json({ error: 'Not a group member' });
    }

    const { data, error } = await supabaseAdmin
      .from('group_sender_keys')
      .select('sender_id, ciphertext, iv, sender_identity_pub, created_at')
      .eq('group_id', groupId)
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message,
        hint: 'Apply supabase/migrations/035_group_sender_keys.sql',
      });
    }
    return res.json({ keys: data ?? [] });
  })
);

router.delete(
  '/:groupId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const groupId = req.params.groupId;

    await supabaseAdmin.from('group_invites').delete().eq('group_id', groupId);
    await supabaseAdmin.from('group_members').delete().eq('group_id', groupId);
    await supabaseAdmin.from('group_sender_keys').delete().eq('group_id', groupId);

    const { error } = await supabaseAdmin.from('groups').delete().eq('id', groupId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

export default router;
