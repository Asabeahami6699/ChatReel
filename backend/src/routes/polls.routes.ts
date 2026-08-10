import { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  getProfileIdByUserId,
  requireAuth,
  type AuthedRequest,
} from '../middleware/auth';
import { chatKeyFor, emitToChat } from '../realtime/wsGateway';
import { createGroupPoll, getPollByMessageId, voteOnPoll } from '../services/polls.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const router = Router();

const createSchema = z.object({
  group_id: z.string().uuid(),
  question: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(80)).min(2).max(8),
  allows_multiple: z.boolean().optional(),
});

const voteSchema = z.object({
  option_id: z.string().uuid(),
});

async function assertGroupMember(groupId: string, profileId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', profileId)
    .maybeSingle();
  return Boolean(data);
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createSchema.parse(req.body ?? {});
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });
    if (!(await assertGroupMember(body.group_id, profileId))) {
      return res.status(403).json({ error: 'Not a group member' });
    }

    const { data: message, error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({
        group_id: body.group_id,
        sender_id: profileId,
        content: body.question,
        message_type: 'poll',
        plaintext: true,
      })
      .select('id, created_at')
      .single();
    if (msgErr || !message) {
      return res.status(400).json({ error: msgErr?.message || 'Could not create poll message' });
    }

    try {
      const poll = await createGroupPoll({
        messageId: message.id,
        groupId: body.group_id,
        createdBy: profileId,
        question: body.question,
        options: body.options,
        allowsMultiple: body.allows_multiple,
      });

      const key = chatKeyFor({ isGroup: true, chatId: body.group_id });
      emitToChat(key, {
        type: 'message.created',
        chat_key: key,
        message: {
          id: message.id,
          group_id: body.group_id,
          sender_id: profileId,
          content: body.question,
          message_type: 'poll',
          created_at: message.created_at,
          poll,
        },
      });

      return res.status(201).json({
        message_id: message.id,
        created_at: message.created_at,
        poll,
      });
    } catch (err) {
      await supabaseAdmin.from('messages').delete().eq('id', message.id);
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not create poll',
      });
    }
  })
);

router.get(
  '/by-message/:messageId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });
    const messageId = String(req.params.messageId ?? '');
    const poll = await getPollByMessageId(messageId, profileId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    return res.json({ poll });
  })
);

router.post(
  '/:pollId/vote',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = voteSchema.parse(req.body ?? {});
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    try {
      const poll = await voteOnPoll({
        pollId: String(req.params.pollId ?? ''),
        optionId: body.option_id,
        userId: profileId,
      });
      emitToChat(chatKeyFor({ isGroup: true, chatId: poll.group_id }), {
        type: 'poll.updated',
        poll,
      });
      return res.json({ poll });
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not vote',
      });
    }
  })
);

export default router;
