import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.post(
  '/sessions',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ref = `${req.userId}_${Date.now()}`;
    const expires_at = new Date(Date.now() + 30 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('qr_sessions')
      .insert({ user_id: req.userId!, ref, expires_at })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ session: data, ref });
  })
);

router.get(
  '/sessions/:ref',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('qr_sessions')
      .select('*')
      .eq('ref', req.params.ref)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Invalid or expired QR code' });
    if (new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ error: 'QR code expired' });
    }

    return res.json({ session: data });
  })
);

router.post(
  '/link',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { ref } = z.object({ ref: z.string().min(1) }).parse(req.body);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('qr_sessions')
      .select('*')
      .eq('ref', ref)
      .maybeSingle();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Invalid or expired QR code' });
    }
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ error: 'QR code expired' });
    }

    const { error } = await supabaseAdmin.from('linked_devices').insert({
      user_id: req.userId!,
      linked_user_id: session.user_id,
      linked_at: new Date().toISOString(),
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

export default router;
