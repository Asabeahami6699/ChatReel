import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';
import { sendPushToUserSafe } from '../services/push.service';

const router = Router();

const EDIT_WINDOW_MS = 15 * 60 * 1000;

const messageSchema = z.object({
  content: z.string(),
  message_type: z.string().default('text'),
  receiver_id: z.string().uuid().optional(),
  group_id: z.string().uuid().optional(),
  file_url: z.string().optional(),
  file_name: z.string().optional(),
  file_type: z.string().optional(),
  audio_url: z.string().optional(),
  audio_duration: z.number().optional(),
  plaintext: z.boolean().optional(),
  iv: z.string().optional(),
  ephemeral_public_key: z.string().optional(),
  reel_id: z.string().uuid().optional(),
  moment_id: z.string().uuid().optional(),
  reply_to_id: z.string().uuid().optional(),
  expires_at: z.string().datetime().optional(),
  view_once: z.boolean().optional(),
});

async function attachReactions(messageIds: string[]) {
  if (!messageIds.length) return {} as Record<string, { emoji: string; user_id: string }[]>;

  const { data } = await supabaseAdmin
    .from('message_reactions')
    .select('message_id, emoji, user_id')
    .in('message_id', messageIds);

  const map: Record<string, { emoji: string; user_id: string }[]> = {};
  for (const row of data ?? []) {
    if (!map[row.message_id]) map[row.message_id] = [];
    map[row.message_id].push({ emoji: row.emoji, user_id: row.user_id });
  }
  return map;
}

async function attachGroupReadStats(
  messages: Array<{ id: string; sender_id: string; group_id?: string | null }>,
  viewerId: string,
  groupId: string
) {
  const outgoing = messages.filter((m) => m.sender_id === viewerId && m.group_id === groupId);
  if (!outgoing.length) return {} as Record<string, { read_count: number; member_count: number }>;

  const { count: memberCount } = await supabaseAdmin
    .from('group_members')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId);

  const recipients = Math.max((memberCount ?? 1) - 1, 0);
  const ids = outgoing.map((m) => m.id);

  const { data: reads } = await supabaseAdmin
    .from('message_reads')
    .select('message_id, user_id')
    .in('message_id', ids);

  const countMap = new Map<string, number>();
  for (const row of reads ?? []) {
    if (row.user_id === viewerId) continue;
    countMap.set(row.message_id, (countMap.get(row.message_id) ?? 0) + 1);
  }

  const stats: Record<string, { read_count: number; member_count: number }> = {};
  for (const id of ids) {
    stats[id] = { read_count: countMap.get(id) ?? 0, member_count: recipients };
  }
  return stats;
}

async function markGroupMessagesRead(userId: string, groupId: string) {
  const now = new Date().toISOString();

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('group_id', groupId)
    .neq('sender_id', userId)
    .is('deleted_at', null);

  const messageIds = (messages ?? []).map((m) => m.id);
  if (!messageIds.length) return;

  const { data: existing } = await supabaseAdmin
    .from('message_reads')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', messageIds);

  const readSet = new Set((existing ?? []).map((r) => r.message_id));
  const toInsert = messageIds
    .filter((id) => !readSet.has(id))
    .map((message_id) => ({ message_id, user_id: userId, read_at: now }));

  if (!toInsert.length) return;

  await supabaseAdmin
    .from('message_reads')
    .upsert(toInsert, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const chatId = req.query.chat_id as string;
    const isGroup = req.query.is_group === 'true';
    const since = req.query.since as string | undefined;

    if (!chatId) {
      return res.status(400).json({ error: 'chat_id query param is required' });
    }

    const limit = Number(req.query.limit ?? 100);
    const before = req.query.before as string | undefined;

    const buildListQuery = () => {
      let q = supabaseAdmin.from('messages').select('*');

      if (since) q = q.gt('created_at', since);
      if (before) q = q.lt('created_at', before);

      if (isGroup) {
        q = q.eq('group_id', chatId);
      } else {
        q = q.or(
          `and(sender_id.eq.${userId},receiver_id.eq.${chatId}),and(sender_id.eq.${chatId},receiver_id.eq.${userId})`
        );
      }

      // Newest page first; client displays ascending chronological order.
      return q.order('created_at', { ascending: false }).limit(limit);
    };

    let { data, error } = await buildListQuery().is('deleted_at', null);
    if (error?.message?.includes('deleted_at')) {
      ({ data, error } = await buildListQuery());
    }
    if (error) return res.status(500).json({ error: error.message });

    const nowMs = Date.now();
    const messages = [...(data ?? [])].reverse().filter((m) => {
      // Time-based disappearing media: hide for everyone once expired.
      if (m.expires_at && new Date(m.expires_at).getTime() <= nowMs) return false;
      // View-once media: hide from everyone (sender + recipient) once it's been opened.
      if (m.view_once && m.viewed_at) return false;
      return true;
    });
    let reactionMap: Record<string, { emoji: string; user_id: string }[]> = {};
    try {
      reactionMap = await attachReactions(messages.map((m) => m.id));
    } catch {
      /* message_reactions table may be missing until migration */
    }

    let readStats: Record<string, { read_count: number; member_count: number }> = {};
    let readByMeMap: Record<string, boolean> = {};
    if (isGroup) {
      try {
        readStats = await attachGroupReadStats(messages, userId, chatId);
        const incomingIds = messages
          .filter((m) => m.sender_id !== userId)
          .map((m) => m.id);
        if (incomingIds.length) {
          const { data: myReads } = await supabaseAdmin
            .from('message_reads')
            .select('message_id')
            .eq('user_id', userId)
            .in('message_id', incomingIds);
          const set = new Set((myReads ?? []).map((r) => r.message_id));
          readByMeMap = Object.fromEntries(incomingIds.map((id) => [id, set.has(id)]));
        }
      } catch {
        /* message_reads table may be missing until migration 018 */
      }
    }

    const enriched = messages.map((m) => ({
      ...m,
      reactions: reactionMap[m.id] ?? [],
      ...(readStats[m.id] ?? {}),
      ...(isGroup && m.sender_id !== userId
        ? { is_read: readByMeMap[m.id] ?? false }
        : {}),
    }));

    return res.json({ messages: enriched });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = messageSchema.parse(req.body);
    const userId = req.userId!;

    if (!body.receiver_id && !body.group_id) {
      return res.status(400).json({ error: 'receiver_id or group_id is required' });
    }

    const baseInsert: Record<string, unknown> = {
      sender_id: userId,
      receiver_id: body.receiver_id ?? null,
      group_id: body.group_id ?? null,
      content: body.content,
      message_type: body.message_type,
      file_url: body.file_url,
      file_name: body.file_name,
      file_type: body.file_type,
      audio_url: body.audio_url,
      audio_duration: body.audio_duration,
      plaintext: body.plaintext ?? true,
      iv: body.iv,
      ephemeral_public_key: body.ephemeral_public_key,
      reel_id: body.reel_id ?? null,
      moment_id: body.moment_id ?? null,
      reply_to_id: body.reply_to_id ?? null,
    };

    const disappearingInsert: Record<string, unknown> = {
      ...baseInsert,
      expires_at: body.expires_at ?? null,
      view_once: body.view_once ?? false,
    };

    let { data, error } = await supabaseAdmin
      .from('messages')
      .insert(disappearingInsert)
      .select()
      .single();

    // Gracefully fall back if migration 019 hasn't been applied yet.
    if (error && /expires_at|view_once/.test(error.message)) {
      ({ data, error } = await supabaseAdmin
        .from('messages')
        .insert(baseInsert)
        .select()
        .single());
    }

    if (error) return res.status(500).json({ error: error.message });

    if (body.receiver_id && body.receiver_id !== userId) {
      const { data: senderProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name, email')
        .eq('user_id', userId)
        .maybeSingle();

      const senderName =
        senderProfile?.display_name || senderProfile?.email?.split('@')[0] || 'New message';
      const preview =
        body.message_type === 'text'
          ? body.content.slice(0, 120)
          : body.message_type === 'reel'
            ? 'Shared a reel'
            : body.message_type === 'moment'
              ? 'Replied to your moment'
              : `Sent a ${body.message_type}`;

      sendPushToUserSafe(body.receiver_id, {
        title: senderName,
        body: preview,
        data: {
          type: 'message',
          chat_id: userId,
          message_id: data.id,
        },
      });
    }

    return res.status(201).json({ message: data });
  })
);

router.patch(
  '/read',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        partner_user_id: z.string().uuid().optional(),
        group_id: z.string().uuid().optional(),
        message_id: z.string().uuid().optional(),
      })
      .parse(req.body);

    const userId = req.userId!;
    const now = new Date().toISOString();

    if (body.message_id) {
      const { data: target } = await supabaseAdmin
        .from('messages')
        .select('id, receiver_id, group_id, sender_id')
        .eq('id', body.message_id)
        .maybeSingle();

      if (!target) return res.status(404).json({ error: 'Message not found' });

      if (target.group_id) {
        const { data: member } = await supabaseAdmin
          .from('group_members')
          .select('id')
          .eq('group_id', target.group_id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!member) return res.status(403).json({ error: 'Not a group member' });

        const { error } = await supabaseAdmin.from('message_reads').upsert(
          {
            message_id: body.message_id,
            user_id: userId,
            read_at: now,
          },
          { onConflict: 'message_id,user_id' }
        );

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      } else if (target.receiver_id !== userId) {
        return res.status(403).json({ error: 'Not allowed' });
      }

      const { error } = await supabaseAdmin
        .from('messages')
        .update({ is_read: true, read_at: now })
        .eq('id', body.message_id)
        .eq('is_read', false);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    if (body.group_id) {
      const { data: member } = await supabaseAdmin
        .from('group_members')
        .select('id')
        .eq('group_id', body.group_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!member) return res.status(403).json({ error: 'Not a group member' });

      await markGroupMessagesRead(userId, body.group_id);
      return res.json({ success: true });
    }

    if (body.partner_user_id) {
      const { error } = await supabaseAdmin
        .from('messages')
        .update({ is_read: true, read_at: now })
        .eq('sender_id', body.partner_user_id)
        .eq('receiver_id', userId)
        .eq('is_read', false);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Specify message_id, group_id, or partner_user_id' });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const messageId = z.string().uuid().parse(req.params.id);
    const body = z.object({ content: z.string().min(1) }).parse(req.body);

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, created_at, message_type')
      .eq('id', messageId)
      .maybeSingle();

    if (fetchError) return res.status(500).json({ error: fetchError.message });
    if (!existing) return res.status(404).json({ error: 'Message not found' });
    if (existing.sender_id !== userId) return res.status(403).json({ error: 'Not allowed' });
    if (existing.message_type !== 'text') {
      return res.status(400).json({ error: 'Only text messages can be edited' });
    }

    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age > EDIT_WINDOW_MS) {
      return res.status(400).json({ error: 'Edit window expired (15 minutes)' });
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .update({ content: body.content, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: data });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const messageId = z.string().uuid().parse(req.params.id);
    const forEveryone = req.query.for_everyone === 'true';

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, created_at')
      .eq('id', messageId)
      .maybeSingle();

    if (fetchError) return res.status(500).json({ error: fetchError.message });
    if (!existing) return res.status(404).json({ error: 'Message not found' });

    if (forEveryone) {
      if (existing.sender_id !== userId) {
        return res.status(403).json({ error: 'Only the sender can delete for everyone' });
      }
      const age = Date.now() - new Date(existing.created_at).getTime();
      if (age > 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Delete-for-everyone window expired (1 hour)' });
      }

      const { error } = await supabaseAdmin
        .from('messages')
        .update({
          deleted_at: new Date().toISOString(),
          content: 'This message was deleted',
          message_type: 'text',
        })
        .eq('id', messageId);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    if (existing.sender_id !== userId) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const { error } = await supabaseAdmin
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.post(
  '/:id/reactions',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const messageId = z.string().uuid().parse(req.params.id);
    const body = z.object({ emoji: z.string().min(1).max(8) }).parse(req.body);

    const { data: existing } = await supabaseAdmin
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', body.emoji)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from('message_reactions').delete().eq('id', existing.id);
      return res.json({ toggled: false, emoji: body.emoji });
    }

    const { error } = await supabaseAdmin.from('message_reactions').insert({
      message_id: messageId,
      user_id: userId,
      emoji: body.emoji,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ toggled: true, emoji: body.emoji });
  })
);

// Mark a view-once message as opened by the recipient.
router.post(
  '/:id/view',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const messageId = z.string().uuid().parse(req.params.id);

    const { data: message, error: fetchError } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, view_once, viewed_at')
      .eq('id', messageId)
      .maybeSingle();

    if (fetchError && /view_once|viewed_at/.test(fetchError.message)) {
      // Migration 019 not applied yet — nothing to mark.
      return res.json({ success: true });
    }
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Only the recipient marks it viewed, and only once.
    if (message.sender_id === userId || !message.view_once || message.viewed_at) {
      return res.json({ success: true });
    }

    const { error } = await supabaseAdmin
      .from('messages')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.get(
  '/:id/reads',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const messageId = z.string().uuid().parse(req.params.id);

    const { data: message } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, group_id')
      .eq('id', messageId)
      .maybeSingle();

    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (!message.group_id) return res.json({ readers: [] });
    if (message.sender_id !== userId) {
      return res.status(403).json({ error: 'Only the sender can view read receipts' });
    }

    const { data: reads } = await supabaseAdmin
      .from('message_reads')
      .select('user_id, read_at')
      .eq('message_id', messageId)
      .neq('user_id', userId);

    const userIds = (reads ?? []).map((r) => r.user_id);
    if (!userIds.length) return res.json({ readers: [] });

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url, email')
      .in('user_id', userIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const readers = (reads ?? []).map((r) => {
      const p = profileMap.get(r.user_id);
      return {
        user_id: r.user_id,
        read_at: r.read_at,
        display_name: p?.display_name || p?.email?.split('@')[0] || 'Member',
        avatar_url: p?.avatar_url ?? null,
      };
    });

    return res.json({ readers });
  })
);

export default router;
