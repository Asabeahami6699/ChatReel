import { Router } from 'express';
import { z } from 'zod';
import { supabaseAuth, supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler } from '../middleware/auth';

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email().transform((e) => e.trim().toLowerCase()),
  password: z.string().min(6),
  display_name: z.string().optional(),
});

function authErrorResponse(error: { message: string }) {
  const msg = mapSupabaseErrorMessage(error.message);
  if (/email not confirmed/i.test(msg)) {
    return { status: 403 as const, error: 'Email not confirmed. Check your inbox or disable confirmation in Supabase for local dev.' };
  }
  if (/invalid login credentials/i.test(msg)) {
    return {
      status: 401 as const,
      error: 'Invalid email or password. If you just signed up, confirm your email first.',
    };
  }
  return { status: 400 as const, error: msg };
}

function mapSupabaseErrorMessage(message: string): string {
  if (/fetch failed/i.test(message)) {
    return 'Cannot reach Supabase. Check SUPABASE_URL in backend/.env — the project may be missing, paused, or the URL is wrong.';
  }
  return message;
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = credentialsSchema.parse(req.body);

    const { data, error } = await supabaseAuth.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: { display_name: body.display_name ?? '' },
      },
    });

    if (error) {
      return res.status(400).json({ error: mapSupabaseErrorMessage(error.message) });
    }

    if (data.user) {
      await supabaseAdmin.from('profiles').upsert(
        {
          user_id: data.user.id,
          email: body.email,
          display_name: body.display_name ?? body.email.split('@')[0],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    }

    return res.status(201).json({
      user: data.user,
      session: data.session,
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = credentialsSchema.parse(req.body);

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      const { status, error: message } = authErrorResponse(error);
      return res.status(status).json({ error: message });
    }

    return res.json({
      user: data.user,
      session: data.session,
    });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = z.string().parse(req.body.refresh_token);

    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      return res.status(401).json({ error: error?.message ?? 'Refresh failed' });
    }

    return res.json({ session: data.session, user: data.user });
  })
);

export default router;
