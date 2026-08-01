import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

/** Long enough to focus the camera, hold steady, and confirm. */
const QR_TTL_MS = 3 * 60 * 1000;

router.post(
  '/sessions',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ref = `${req.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expires_at = new Date(Date.now() + QR_TTL_MS).toISOString();

    const { data, error } = await supabaseAdmin
      .from('qr_sessions')
      .insert({ user_id: req.userId!, ref, expires_at })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({
      session: data,
      ref,
      expires_in_sec: Math.floor(QR_TTL_MS / 1000),
    });
  })
);

router.get(
  '/sessions/:ref',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ref = decodeURIComponent(String(req.params.ref || '')).trim();
    const { data, error } = await supabaseAdmin
      .from('qr_sessions')
      .select('*')
      .eq('ref', ref)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) {
      return res.status(404).json({ error: 'Invalid QR code. Generate a new one and try again.' });
    }
    if (new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ error: 'QR code expired. Ask for a new code.' });
    }

    return res.json({ session: data });
  })
);

router.post(
  '/link',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { ref } = z.object({ ref: z.string().min(1) }).parse(req.body);
    const cleanRef = ref.trim();

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('qr_sessions')
      .select('*')
      .eq('ref', cleanRef)
      .maybeSingle();

    if (sessionError) return res.status(500).json({ error: sessionError.message });
    if (!session) {
      return res.status(404).json({ error: 'Invalid QR code. Generate a new one and try again.' });
    }
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ error: 'QR code expired. Ask for a new code.' });
    }

    const ownerId = session.user_id as string;
    const scannerId = req.userId!;

    const { data: existing } = await supabaseAdmin
      .from('linked_devices')
      .select('id')
      .eq('user_id', ownerId)
      .eq('linked_user_id', scannerId)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin.from('linked_devices').insert({
        user_id: ownerId,
        linked_user_id: scannerId,
        linked_at: new Date().toISOString(),
      });
      if (error) return res.status(500).json({ error: error.message });
    }

    // One-time use.
    await supabaseAdmin.from('qr_sessions').delete().eq('ref', cleanRef);

    return res.json({ success: true, owner_user_id: ownerId });
  })
);

export default router;
