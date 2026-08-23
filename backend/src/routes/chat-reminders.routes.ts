import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const chatTypeSchema = z.enum(['individual', 'group']);
const statusSchema = z.enum(['pending', 'fired', 'done', 'cancelled']);

const optionalUuid = z
  .union([z.string().uuid(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const createSchema = z.object({
  chat_id: z.string().uuid(),
  chat_type: chatTypeSchema,
  message_id: optionalUuid,
  remind_at: z.string().min(1),
  note: z.string().max(500).nullable().optional(),
  preview_text: z.string().max(500).nullable().optional(),
  chat_name: z.string().max(200).nullable().optional(),
});

const patchSchema = z.object({
  remind_at: z.string().min(1).optional(),
  note: z.string().max(500).nullable().optional(),
  status: z.enum(['pending', 'done', 'cancelled']).optional(),
  snooze_minutes: z.number().int().min(1).max(60 * 24 * 14).optional(),
});

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    chat_id: row.chat_id,
    chat_type: row.chat_type,
    message_id: row.message_id ?? null,
    remind_at: row.remind_at,
    note: row.note ?? null,
    preview_text: row.preview_text ?? null,
    chat_name: row.chat_name ?? null,
    status: row.status,
    fired_at: row.fired_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function dbErrorStatus(message: string): number {
  if (/schema cache|does not exist|Could not find the table/i.test(message)) {
    return 503;
  }
  return 500;
}

async function insertReminder(row: Record<string, unknown>) {
  return supabaseAdmin.from('chat_reminders').insert(row).select('*').single();
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const statusParam = typeof req.query.status === 'string' ? req.query.status : 'active';

    let query = supabaseAdmin
      .from('chat_reminders')
      .select('*')
      .eq('user_id', userId)
      .order('remind_at', { ascending: true });

    if (statusParam === 'active') {
      query = query.in('status', ['pending', 'fired']);
    } else if (statusParam === 'all') {
      // no filter
    } else {
      const parsed = statusSchema.safeParse(statusParam);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      query = query.eq('status', parsed.data);
    }

    const { data, error } = await query.limit(200);
    if (error) {
      return res.status(dbErrorStatus(error.message)).json({ error: error.message });
    }
    return res.json({ reminders: (data ?? []).map((r) => serialize(r as Record<string, unknown>)) });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({
        error: issue?.message
          ? `Invalid reminder: ${issue.path.join('.') || 'body'} — ${issue.message}`
          : 'Invalid reminder payload',
      });
    }
    const body = parsed.data;
    const remindAt = new Date(body.remind_at);
    if (Number.isNaN(remindAt.getTime()) || remindAt.getTime() < Date.now() - 60_000) {
      return res.status(400).json({ error: 'Pick a time in the future' });
    }

    const baseRow: Record<string, unknown> = {
      user_id: userId,
      chat_id: body.chat_id,
      chat_type: body.chat_type,
      message_id: body.message_id,
      remind_at: remindAt.toISOString(),
      note: body.note?.trim() || null,
      preview_text: body.preview_text?.trim() || null,
      chat_name: body.chat_name?.trim() || null,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    let { data, error } = await insertReminder(baseRow);

    // Local-only / missing messages shouldn't block reminders — keep the anchor soft.
    if (error && body.message_id && /message_id|foreign key/i.test(error.message)) {
      ({ data, error } = await insertReminder({ ...baseRow, message_id: null }));
    }

    if (error) {
      const status = dbErrorStatus(error.message);
      const msg =
        status === 503
          ? 'Reminders are not set up on the database yet. Run migration 049_chat_reminders.sql.'
          : error.message;
      return res.status(status).json({ error: msg });
    }
    return res.status(201).json({ reminder: serialize(data as Record<string, unknown>) });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      return res.status(400).json({ error: 'Invalid reminder id' });
    }
    const id = idParsed.data;
    const bodyParsed = patchSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: 'Invalid reminder update' });
    }
    const body = bodyParsed.data;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('chat_reminders')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) {
      return res.status(dbErrorStatus(fetchErr.message)).json({ error: fetchErr.message });
    }
    if (!existing) return res.status(404).json({ error: 'Reminder not found' });

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.snooze_minutes != null) {
      const base = Math.max(Date.now(), new Date(existing.remind_at as string).getTime());
      patch.remind_at = new Date(base + body.snooze_minutes * 60_000).toISOString();
      patch.status = 'pending';
      patch.fired_at = null;
    } else if (body.remind_at) {
      const next = new Date(body.remind_at);
      if (Number.isNaN(next.getTime()) || next.getTime() < Date.now() - 60_000) {
        return res.status(400).json({ error: 'Pick a time in the future' });
      }
      patch.remind_at = next.toISOString();
      patch.status = 'pending';
      patch.fired_at = null;
    }

    if (body.note !== undefined) patch.note = body.note?.trim() || null;
    if (body.status) {
      patch.status = body.status;
    }

    const { data, error } = await supabaseAdmin
      .from('chat_reminders')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      return res.status(dbErrorStatus(error.message)).json({ error: error.message });
    }
    return res.json({ reminder: serialize(data as Record<string, unknown>) });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      return res.status(400).json({ error: 'Invalid reminder id' });
    }
    const id = idParsed.data;

    const { error } = await supabaseAdmin
      .from('chat_reminders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return res.status(dbErrorStatus(error.message)).json({ error: error.message });
    }
    return res.json({ ok: true });
  })
);

export default router;
