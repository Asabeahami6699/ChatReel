import { Router } from 'express';
import { z } from 'zod';
import { supabaseAuth, supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler } from '../middleware/auth';
import { env } from '../config/env';
import { isE164Phone, maskPhone, normalizePhoneToE164 } from '../lib/phone';
import {
  phoneOtpSendRateLimit,
  phoneOtpVerifyRateLimit,
} from '../middleware/rateLimit';
import { gateSessionWith2fa } from '../services/account2fa.service';
import { requireSignupDateOfBirth } from '../lib/ageGate';

const router = Router();

const dateOfBirthSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const credentialsSchema = z.object({
  email: z.string().email().transform((e) => e.trim().toLowerCase()),
  password: z.string().min(6),
  display_name: z.string().optional(),
  date_of_birth: dateOfBirthSchema,
});

const otpSendSchema = z.object({
  phone: z.string().min(7).max(32),
  mode: z.enum(['login', 'register']).default('login'),
  display_name: z.string().trim().min(2).max(60).optional(),
  date_of_birth: dateOfBirthSchema,
});

const otpVerifySchema = z.object({
  phone: z.string().min(7).max(32),
  token: z.string().trim().min(4).max(12),
  display_name: z.string().trim().min(2).max(60).optional(),
  date_of_birth: dateOfBirthSchema,
  email: z
    .string()
    .email()
    .transform((e) => e.trim().toLowerCase())
    .optional()
    .or(z.literal('').transform(() => undefined)),
  installation_id: z.string().min(8).max(128).optional(),
});

const credentialsWithDeviceSchema = credentialsSchema.extend({
  installation_id: z.string().min(8).max(128).optional(),
});

function authErrorResponse(error: { message: string }) {
  const msg = mapSupabaseErrorMessage(error.message);
  if (/email not confirmed/i.test(msg)) {
    return {
      status: 403 as const,
      error:
        'Email not confirmed. Check your inbox or disable confirmation in Supabase for local dev.',
    };
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
  if (/fetch failed|connect timeout|und_err_connect|network/i.test(message)) {
    return 'No internet. Check your connection and try again.';
  }
  if (/unsupported phone provider|phone provider|sms provider not|phone signups? (are )?not enabled/i.test(message)) {
    return 'Phone login is not set up yet. In Supabase → Authentication → Providers → Phone, enable Phone and connect an SMS provider (Twilio, MessageBird, or Vonage). Until then, use email login.';
  }
  if (/sms|otp|twilio|messagebird|vonage/i.test(message)) {
    return message;
  }
  return message;
}

function isNetworkAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { message?: string; cause?: { code?: string; message?: string } };
  const msg = `${anyErr.message ?? ''} ${anyErr.cause?.message ?? ''} ${anyErr.cause?.code ?? ''}`;
  return /fetch failed|connect timeout|und_err_connect|econnrefused|enotfound|network/i.test(msg);
}

function resolvePhone(raw: string): string | null {
  return normalizePhoneToE164(raw, env.authDefaultCountryCode);
}

async function upsertProfileFromAuthUser(opts: {
  userId: string;
  phone: string;
  email?: string | null;
  displayName?: string | null;
  dateOfBirth?: string | null;
}) {
  const displayName =
    opts.displayName?.trim() ||
    (opts.email ? opts.email.split('@')[0] : null) ||
    opts.phone;

  const row: Record<string, unknown> = {
    user_id: opts.userId,
    phone: opts.phone,
    email: opts.email ?? null,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  };
  if (opts.dateOfBirth) {
    row.date_of_birth = opts.dateOfBirth;
  }

  await supabaseAdmin.from('profiles').upsert(row, { onConflict: 'user_id' });
}

/* -------------------------------------------------------------------------- */
/*  Phone OTP — primary auth                                                  */
/* -------------------------------------------------------------------------- */

router.post(
  '/otp/send',
  phoneOtpSendRateLimit,
  asyncHandler(async (req, res) => {
    const body = otpSendSchema.parse(req.body);
    const phone = resolvePhone(body.phone);
    if (!phone || !isE164Phone(phone)) {
      return res.status(400).json({
        error: `Enter a valid phone number (e.g. ${env.authDefaultCountryCode}8012345678).`,
      });
    }

    if (body.mode === 'register' && !body.display_name) {
      return res.status(400).json({ error: 'Display name is required to create an account.' });
    }

    let registerDob: string | undefined;
    if (body.mode === 'register') {
      const dobCheck = requireSignupDateOfBirth(body.date_of_birth);
      if (!dobCheck.ok) {
        return res.status(dobCheck.status).json({ error: dobCheck.error });
      }
      registerDob = dobCheck.dateOfBirth;

      const { data: taken } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
      if (taken) {
        return res.status(409).json({
          error: 'This phone number already has an account. Log in instead.',
        });
      }
    }

    if (body.mode === 'login') {
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
      if (!existing) {
        return res.status(404).json({
          error: 'No account found for this number. Register first.',
        });
      }
    }

    let otpError: { message: string } | null = null;
    try {
      const result = await supabaseAuth.auth.signInWithOtp({
        phone,
        options: {
          shouldCreateUser: body.mode === 'register',
          data:
            body.mode === 'register'
              ? {
                  display_name: body.display_name,
                  date_of_birth: registerDob,
                }
              : undefined,
        },
      });
      otpError = result.error;
    } catch (err) {
      if (isNetworkAuthError(err)) {
        return res.status(503).json({
          error: mapSupabaseErrorMessage('fetch failed'),
        });
      }
      throw err;
    }

    if (otpError) {
      const msg = mapSupabaseErrorMessage(otpError.message);
      if (/signups not allowed|user not found|unable to find/i.test(otpError.message)) {
        return res.status(404).json({
          error: 'No account found for this number. Register first.',
        });
      }
      if (/already registered|already been registered/i.test(otpError.message)) {
        return res.status(409).json({
          error: 'This phone number already has an account. Log in instead.',
        });
      }
      return res.status(400).json({ error: msg });
    }

    return res.json({
      ok: true,
      phone,
      phone_masked: maskPhone(phone),
      message: `Verification code sent to ${maskPhone(phone)}`,
    });
  })
);

router.post(
  '/otp/verify',
  phoneOtpVerifyRateLimit,
  asyncHandler(async (req, res) => {
    const body = otpVerifySchema.parse(req.body);
    const phone = resolvePhone(body.phone);
    if (!phone || !isE164Phone(phone)) {
      return res.status(400).json({
        error: `Enter a valid phone number (e.g. ${env.authDefaultCountryCode}8012345678).`,
      });
    }

    let data: {
      session: { access_token?: string } | null;
      user: {
        id: string;
        email?: string | null;
        user_metadata?: Record<string, unknown>;
      } | null;
    } | null = null;
    let error: { message: string } | null = null;
    try {
      const result = await supabaseAuth.auth.verifyOtp({
        phone,
        token: body.token,
        type: 'sms',
      });
      data = result.data;
      error = result.error;
    } catch (err) {
      if (isNetworkAuthError(err)) {
        return res.status(503).json({
          error: mapSupabaseErrorMessage('fetch failed'),
        });
      }
      throw err;
    }

    if (error || !data?.session || !data.user) {
      return res.status(401).json({
        error: mapSupabaseErrorMessage(error?.message ?? 'Invalid or expired code'),
      });
    }

    // Enforce one profile per phone (blocks race where two auth users claim same number).
    const { data: phoneOwner } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('phone', phone)
      .maybeSingle();

    if (phoneOwner?.user_id && phoneOwner.user_id !== data.user.id) {
      return res.status(409).json({
        error: 'This phone number is already linked to another account.',
      });
    }

    const metaName =
      (typeof data.user.user_metadata?.display_name === 'string'
        ? data.user.user_metadata.display_name
        : null) || body.display_name;

    const metaDob =
      (typeof data.user.user_metadata?.date_of_birth === 'string'
        ? data.user.user_metadata.date_of_birth
        : null) || body.date_of_birth || null;

    let dateOfBirth: string | null = null;
    if (metaDob) {
      const dobCheck = requireSignupDateOfBirth(metaDob);
      if (!dobCheck.ok) {
        // Under-age: do not leave a usable profile; best-effort delete auth user if brand new.
        return res.status(dobCheck.status).json({ error: dobCheck.error });
      }
      dateOfBirth = dobCheck.dateOfBirth;
    } else {
      // New phone users must have passed the age gate; legacy logins may lack DOB.
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, date_of_birth')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (!existingProfile) {
        return res.status(400).json({
          error: 'Birthday is required to create an account.',
        });
      }
    }

    await upsertProfileFromAuthUser({
      userId: data.user.id,
      phone,
      email: body.email ?? data.user.email ?? null,
      displayName: metaName,
      dateOfBirth,
    });

    const gated = await gateSessionWith2fa({
      userId: data.user.id,
      user: data.user,
      session: data.session,
      installationId: body.installation_id,
    });
    if (gated.requires_2fa) {
      return res.json({
        requires_2fa: true,
        challenge_token: gated.challenge_token,
        security_question: gated.security_question,
        user: null,
        session: null,
      });
    }

    return res.json({
      requires_2fa: false,
      user: gated.user,
      session: gated.session,
    });
  })
);

/* -------------------------------------------------------------------------- */
/*  Email/password — legacy fallback for existing accounts                    */
/* -------------------------------------------------------------------------- */

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = credentialsSchema.parse(req.body);
    const displayName = body.display_name ?? body.email.split('@')[0];

    const dobCheck = requireSignupDateOfBirth(body.date_of_birth);
    if (!dobCheck.ok) {
      return res.status(dobCheck.status).json({ error: dobCheck.error });
    }

    // Admin create + email_confirm so login works even when the Supabase
    // project has "Confirm email" enabled (default on new projects).
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        date_of_birth: dobCheck.dateOfBirth,
      },
    });

    if (createError) {
      return res.status(400).json({ error: mapSupabaseErrorMessage(createError.message) });
    }

    const user = created.user;
    if (!user) {
      return res.status(500).json({ error: 'Registration failed' });
    }

    await supabaseAdmin.from('profiles').upsert(
      {
        user_id: user.id,
        email: body.email,
        display_name: displayName,
        date_of_birth: dobCheck.dateOfBirth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    // Mint a session so the app can log in immediately after sign-up.
    const { data: signedIn, error: loginError } = await supabaseAuth.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (loginError) {
      // User exists and is confirmed; client can still hit /login.
      return res.status(201).json({ user, session: null });
    }

    return res.status(201).json({
      user: signedIn.user ?? user,
      session: signedIn.session,
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = credentialsWithDeviceSchema.parse(req.body);

    let data: { user: unknown; session: unknown } | null = null;
    let error: { message: string } | null = null;
    try {
      const result = await supabaseAuth.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });
      data = result.data;
      error = result.error;
    } catch (err) {
      if (isNetworkAuthError(err)) {
        return res.status(503).json({
          error: mapSupabaseErrorMessage('fetch failed'),
        });
      }
      throw err;
    }

    // New Supabase projects default to "Confirm email". Our API owns signup, so
    // auto-confirm once and retry instead of blocking the client.
    if (error && /email not confirmed/i.test(error.message)) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('email', body.email)
        .maybeSingle();
      if (profile?.user_id) {
        await supabaseAdmin.auth.admin.updateUserById(profile.user_id, {
          email_confirm: true,
        });
        try {
          const retry = await supabaseAuth.auth.signInWithPassword({
            email: body.email,
            password: body.password,
          });
          data = retry.data;
          error = retry.error;
        } catch (err) {
          if (isNetworkAuthError(err)) {
            return res.status(503).json({
              error: mapSupabaseErrorMessage('fetch failed'),
            });
          }
          throw err;
        }
      }
    }

    if (error) {
      const { status, error: message } = authErrorResponse(error);
      return res.status(status).json({ error: message });
    }

    const user = data?.user as { id?: string } | null | undefined;
    if (!user?.id || !data?.session) {
      return res.status(401).json({ error: 'Login failed' });
    }

    const gated = await gateSessionWith2fa({
      userId: user.id,
      user: data.user,
      session: data.session,
      installationId: body.installation_id,
    });
    if (gated.requires_2fa) {
      return res.json({
        requires_2fa: true,
        challenge_token: gated.challenge_token,
        security_question: gated.security_question,
        user: null,
        session: null,
      });
    }

    return res.json({
      requires_2fa: false,
      user: gated.user,
      session: gated.session,
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
