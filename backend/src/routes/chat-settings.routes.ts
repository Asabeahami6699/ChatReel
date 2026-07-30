import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const prefsSchema = z.object({
  muted_until: z.string().datetime().nullable().optional(),
  wallpaper: z.string().nullable().optional(),
  cleared_at: z.string().datetime().nullable().optional(),
  starred_message_ids: z.array(z.string().uuid()).optional(),
  /** Seconds after read until messages vanish. null/0 = off. */
  disappear_after_seconds: z
    .number()
    .int()
    .nullable()
    .optional()
    .refine(
      (v) =>
        v == null ||
        v === 0 ||
        [60, 1800, 86400, 604800, 2592000, 7776000].includes(v),
      { message: 'Invalid disappear duration' }
    ),
  is_archived: z.boolean().optional(),
  pinned_at: z.string().datetime().nullable().optional(),
});

router.get(
  '/:chatType/:chatId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const chatType = z.enum(['individual', 'group']).parse(req.params.chatType);
    const chatId = z.string().uuid().parse(req.params.chatId);

    const { data, error } = await supabaseAdmin
      .from('chat_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .eq('chat_type', chatType)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({
      preferences: data ?? {
        user_id: userId,
        chat_id: chatId,
        chat_type: chatType,
        muted_until: null,
        wallpaper: null,
        cleared_at: null,
        starred_message_ids: [],
        disappear_after_seconds: null,
        is_archived: false,
        pinned_at: null,
      },
    });
  })
);

router.patch(
  '/:chatType/:chatId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const chatType = z.enum(['individual', 'group']).parse(req.params.chatType);
    const chatId = z.string().uuid().parse(req.params.chatId);
    const body = prefsSchema.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('chat_preferences')
      .upsert(
        {
          user_id: userId,
          chat_id: chatId,
          chat_type: chatType,
          ...body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,chat_id,chat_type' }
      )
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // DMs: keep the disappear timer the same for both people
    if (
      chatType === 'individual' &&
      Object.prototype.hasOwnProperty.call(body, 'disappear_after_seconds')
    ) {
      await supabaseAdmin.from('chat_preferences').upsert(
        {
          user_id: chatId,
          chat_id: userId,
          chat_type: 'individual',
          disappear_after_seconds: body.disappear_after_seconds ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,chat_id,chat_type' }
      );
    }

    return res.json({ preferences: data });
  })
);

function dmPeerPair(userId: string, peerId: string): { low: string; high: string } {
  return userId < peerId
    ? { low: userId, high: peerId }
    : { low: peerId, high: userId };
}

async function assertCanPinMessage(
  userId: string,
  chatType: 'individual' | 'group',
  chatId: string,
  messageId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: msg } = await supabaseAdmin
    .from('messages')
    .select('id, sender_id, receiver_id, group_id')
    .eq('id', messageId)
    .maybeSingle();

  if (!msg) return { ok: false, status: 404, error: 'Message not found' };

  if (chatType === 'group') {
    if (msg.group_id !== chatId) {
      return { ok: false, status: 400, error: 'Message is not in this group' };
    }
    const { data: member } = await supabaseAdmin
      .from('group_members')
      .select('id')
      .eq('group_id', chatId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!member) return { ok: false, status: 403, error: 'Not a group member' };
    return { ok: true };
  }

  // individual: chatId is the peer user id
  const peers = [msg.sender_id, msg.receiver_id].filter(Boolean);
  if (
    msg.group_id ||
    !msg.receiver_id ||
    !peers.includes(userId) ||
    !peers.includes(chatId)
  ) {
    return { ok: false, status: 403, error: 'Not a participant in this chat' };
  }
  return { ok: true };
}

router.post(
  '/:chatType/:chatId/pin/:messageId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const chatType = z.enum(['individual', 'group']).parse(req.params.chatType);
    const chatId = z.string().uuid().parse(req.params.chatId);
    const messageId = z.string().uuid().parse(req.params.messageId);

    const access = await assertCanPinMessage(userId, chatType, chatId, messageId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    if (chatType === 'group') {
      const { data, error } = await supabaseAdmin
        .from('pinned_messages')
        .upsert(
          {
            group_id: chatId,
            message_id: messageId,
            pinned_by: userId,
            pinned_at: new Date().toISOString(),
          },
          { onConflict: 'group_id,message_id' }
        )
        .select('*')
        .single();

      if (error) {
        const hint = /peer_user|null value in column \"group_id\"|NOT NULL/i.test(
          error.message
        )
          ? ' Run migration 039_dm_pinned_messages.sql on Supabase, then retry.'
          : '';
        return res.status(500).json({ error: `${error.message}${hint}` });
      }
      return res.json({ pinned: data });
    }

    const pair = dmPeerPair(userId, chatId);
    // Multi-pin: upsert this message without clearing other pins for the pair.
    const { data: existing } = await supabaseAdmin
      .from('pinned_messages')
      .select('id')
      .is('group_id', null)
      .eq('peer_user_low', pair.low)
      .eq('peer_user_high', pair.high)
      .eq('message_id', messageId)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from('pinned_messages')
        .update({
          pinned_by: userId,
          pinned_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ pinned: data });
    }

    const { data, error } = await supabaseAdmin
      .from('pinned_messages')
      .insert({
        group_id: null,
        peer_user_low: pair.low,
        peer_user_high: pair.high,
        message_id: messageId,
        pinned_by: userId,
        pinned_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      const hint = /null value in column \"group_id\"|peer_user|NOT NULL|column .* does not exist/i.test(
        error.message
      )
        ? ' Run migration 039_dm_pinned_messages.sql on Supabase, then retry.'
        : '';
      return res.status(500).json({ error: `${error.message}${hint}` });
    }
    return res.json({ pinned: data });
  })
);

router.delete(
  '/:chatType/:chatId/pin/:messageId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const chatType = z.enum(['individual', 'group']).parse(req.params.chatType);
    const chatId = z.string().uuid().parse(req.params.chatId);
    const messageId = z.string().uuid().parse(req.params.messageId);

    const access = await assertCanPinMessage(userId, chatType, chatId, messageId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    if (chatType === 'group') {
      const { error } = await supabaseAdmin
        .from('pinned_messages')
        .delete()
        .eq('group_id', chatId)
        .eq('message_id', messageId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    const pair = dmPeerPair(userId, chatId);
    const { error } = await supabaseAdmin
      .from('pinned_messages')
      .delete()
      .is('group_id', null)
      .eq('peer_user_low', pair.low)
      .eq('peer_user_high', pair.high)
      .eq('message_id', messageId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.get(
  '/:chatType/:chatId/pinned',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const chatType = z.enum(['individual', 'group']).parse(req.params.chatType);
    const chatId = z.string().uuid().parse(req.params.chatId);

    if (chatType === 'group') {
      const { data: member } = await supabaseAdmin
        .from('group_members')
        .select('id')
        .eq('group_id', chatId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!member) return res.status(403).json({ error: 'Not a group member' });

      const { data, error } = await supabaseAdmin
        .from('pinned_messages')
        .select('*, messages(*)')
        .eq('group_id', chatId)
        .order('pinned_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ pinned: data ?? [] });
    }

    const pair = dmPeerPair(userId, chatId);
    const { data, error } = await supabaseAdmin
      .from('pinned_messages')
      .select('*, messages(*)')
      .is('group_id', null)
      .eq('peer_user_low', pair.low)
      .eq('peer_user_high', pair.high)
      .order('pinned_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ pinned: data ?? [] });
  })
);

export default router;
