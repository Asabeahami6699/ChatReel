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
    return res.json({ preferences: data });
  })
);

router.post(
  '/:chatType/:chatId/pin/:messageId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const chatType = z.enum(['individual', 'group']).parse(req.params.chatType);
    const chatId = z.string().uuid().parse(req.params.chatId);
    const messageId = z.string().uuid().parse(req.params.messageId);

    if (chatType !== 'group') {
      return res.status(400).json({ error: 'Pinning is only supported in group chats' });
    }

    const { data: member } = await supabaseAdmin
      .from('group_members')
      .select('id')
      .eq('group_id', chatId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member) return res.status(403).json({ error: 'Not a group member' });

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

    if (error) return res.status(500).json({ error: error.message });
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

    if (chatType !== 'group') {
      return res.status(400).json({ error: 'Pinning is only supported in group chats' });
    }

    const { data: member } = await supabaseAdmin
      .from('group_members')
      .select('role')
      .eq('group_id', chatId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member) return res.status(403).json({ error: 'Not a group member' });

    const { error } = await supabaseAdmin
      .from('pinned_messages')
      .delete()
      .eq('group_id', chatId)
      .eq('message_id', messageId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.get(
  '/:chatType/:chatId/pinned',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const chatType = z.enum(['individual', 'group']).parse(req.params.chatType);
    const chatId = z.string().uuid().parse(req.params.chatId);

    if (chatType !== 'group') {
      return res.json({ pinned: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('pinned_messages')
      .select('*, messages(*)')
      .eq('group_id', chatId)
      .order('pinned_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ pinned: data ?? [] });
  })
);

export default router;
