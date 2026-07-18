import { Router } from 'express';
import { z } from 'zod';
import {
  clearActiveChatFocus,
  setActiveChatFocus,
} from '../lib/activeChatFocus';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  getCachedProfileMe,
  invalidateProfileMe,
  setCachedProfileMe,
} from '../lib/profileMeCache';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';
import { getProfileSuggestions } from '../services/suggestions.service';

const router = Router();

router.get(
  '/suggestions',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const suggestions = await getProfileSuggestions(req.userId!);
    return res.json(suggestions);
  })
);

router.get(
  '/batch',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ids = String(req.query.user_ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!ids.length) return res.json({ profiles: [] });

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url, email')
      .in('user_id', ids);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ profiles: data ?? [] });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const cached = getCachedProfileMe(userId);
    if (cached) {
      res.set('Cache-Control', 'private, max-age=15');
      return res.json({ profile: cached });
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (data) setCachedProfileMe(userId, data);
    res.set('Cache-Control', 'private, max-age=15');
    return res.json({ profile: data });
  })
);

router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ profiles: [] });

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, user_id, display_name, email, avatar_url, region, country, created_at')
      .or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
      .neq('user_id', req.userId!)
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ profiles: data ?? [] });
  })
);

router.get(
  '/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, user_id, display_name, email, avatar_url, region, country, bio, language, status, last_seen_at')
      .eq('user_id', req.params.userId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Profile not found' });
    return res.json({ profile: data });
  })
);

const updateSchema = z.object({
  display_name: z.string().optional(),
  email: z.string().email().optional(),
  avatar_url: z.string().optional(),
  bio: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  language: z.string().optional(),
  status: z.enum(['Online', 'Offline']).optional(),
});

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = updateSchema.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
        // Always bump last_seen so peer presence Realtime stays fresh.
        last_seen_at: new Date().toISOString(),
      })
      .eq('user_id', req.userId!)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    invalidateProfileMe(req.userId!);
    return res.json({ profile: data });
  })
);

/** Lightweight presence ping while the app is foregrounded. */
router.post(
  '/me/heartbeat',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        status: 'Online',
        last_seen_at: now,
        updated_at: now,
      })
      .eq('user_id', req.userId!)
      .select('id, user_id, status, last_seen_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    invalidateProfileMe(req.userId!);
    return res.json({ ok: true, profile: data });
  })
);

/**
 * Report which chat is currently open so message pushes can be skipped
 * (Realtime already delivers to the open room).
 */
router.post(
  '/me/active-chat',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        chat_id: z.string().min(1).nullable(),
        chat_type: z.enum(['individual', 'group']).optional(),
      })
      .parse(req.body);

    const userId = req.userId!;
    if (!body.chat_id) {
      clearActiveChatFocus(userId);
    } else {
      setActiveChatFocus(userId, body.chat_id, body.chat_type ?? 'individual');
    }
    return res.json({ ok: true });
  })
);

export default router;
