import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.string().optional(),
});

router.post(
  '/register',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { token, platform } = registerSchema.parse(req.body);
    const userId = req.userId!;
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: platform ?? null,
        updated_at: now,
      },
      { onConflict: 'user_id,token' }
    );

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.delete(
  '/register',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const userId = req.userId!;

    const { error } = await supabaseAdmin
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

export default router;
