import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.get(
  '/:userId/identity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('public_keys')
      .select('public_key, type')
      .eq('user_id', req.params.userId)
      .eq('type', 'identity')
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Identity key not found' });
    return res.json({ public_key: data.public_key });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        public_key: z.string(),
        type: z.enum(['identity', 'signed_prekey']),
      })
      .parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('public_keys')
      .insert({
        user_id: req.userId!,
        public_key: body.public_key,
        type: body.type,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ key: data });
  })
);

router.post(
  '/prekeys',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ public_keys: z.array(z.string()).min(1).max(200) }).parse(req.body);

    const rows = body.public_keys.map((public_key) => ({
      user_id: req.userId!,
      public_key,
    }));

    const { error } = await supabaseAdmin.from('one_time_prekeys').insert(rows);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ count: rows.length });
  })
);

router.get(
  '/prekeys/count',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { count, error } = await supabaseAdmin
      .from('one_time_prekeys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.userId!)
      .is('used_at', null);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ count: count ?? 0 });
  })
);

export default router;
