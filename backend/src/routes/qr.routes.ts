import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { supabaseAdmin, supabaseAuth } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

/** Long enough to focus the camera, hold steady, and confirm. */
const QR_TTL_MS = 3 * 60 * 1000;
const LOGIN_QR_TTL_MS = 2 * 60 * 1000;

function newLoginRef(): string {
  return `lq_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
}

/**
 * Mint a fresh Supabase session for an existing user (WhatsApp-style QR approve).
 * Uses admin magic-link + verifyOtp so we never need the user's password.
 */
async function mintSessionForUserId(userId: string) {
  const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userErr || !userData.user) {
    throw new Error(userErr?.message || 'User not found');
  }

  let email = userData.user.email?.trim() || '';
  if (!email) {
    // Phone-only accounts: attach a private confirmed email so magic-link minting works.
    email = `u_${userId.replace(/-/g, '')}@login.chatreel.local`;
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (updErr) throw new Error(updErr.message);
  }

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(linkErr?.message || 'Could not mint login session');
  }

  const { data: verified, error: otpErr } = await supabaseAuth.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email',
  });
  if (otpErr || !verified.session || !verified.user) {
    throw new Error(otpErr?.message || 'Could not verify login session');
  }

  return { session: verified.session, user: verified.user };
}

/* ------------------------------------------------------------------ */
/*  WhatsApp-style desktop login QR (unauthenticated desktop)         */
/* ------------------------------------------------------------------ */

router.post(
  '/login-sessions',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        installation_id: z.string().min(8).max(128).optional(),
        device_label: z.string().max(80).optional(),
        device_platform: z.string().max(40).optional(),
      })
      .passthrough()
      .parse(req.body ?? {});

    const ref = newLoginRef();
    const expires_at = new Date(Date.now() + LOGIN_QR_TTL_MS).toISOString();

    const { error } = await supabaseAdmin.from('login_qr_sessions').insert({
      ref,
      status: 'pending',
      expires_at,
      installation_id: body.installation_id ?? null,
      device_label: body.device_label?.slice(0, 80) || null,
      device_platform: body.device_platform?.slice(0, 40) || null,
    });

    if (error) {
      // Table missing → clear migration hint
      if (/login_qr_sessions/i.test(error.message) || error.code === '42P01') {
        return res.status(503).json({
          error: 'Login QR is not set up yet. Apply migration 051_login_qr_sessions.sql.',
        });
      }
      // Column missing (052 not applied) — retry without device meta
      if (/installation_id|device_label|device_platform/i.test(error.message)) {
        const retry = await supabaseAdmin.from('login_qr_sessions').insert({
          ref,
          status: 'pending',
          expires_at,
        });
        if (retry.error) {
          return res.status(500).json({ error: retry.error.message });
        }
        return res.status(201).json({
          ref,
          expires_in_sec: Math.floor(LOGIN_QR_TTL_MS / 1000),
        });
      }
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({
      ref,
      expires_in_sec: Math.floor(LOGIN_QR_TTL_MS / 1000),
    });
  })
);

router.get(
  '/login-sessions/:ref',
  asyncHandler(async (req, res) => {
    const ref = decodeURIComponent(String(req.params.ref || '')).trim();
    const { data, error } = await supabaseAdmin
      .from('login_qr_sessions')
      .select('ref, status, expires_at, access_token, refresh_token, user_json, consumed_at')
      .eq('ref', ref)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) {
      return res.status(404).json({ error: 'Invalid or expired QR code. Refresh and try again.' });
    }

    if (data.status === 'consumed') {
      return res.json({ status: 'consumed' });
    }

    if (new Date(data.expires_at) < new Date()) {
      await supabaseAdmin
        .from('login_qr_sessions')
        .update({ status: 'expired' })
        .eq('ref', ref)
        .eq('status', 'pending');
      return res.status(410).json({ error: 'QR code expired. Refresh for a new code.' });
    }

    if (data.status === 'pending') {
      return res.json({ status: 'pending' });
    }

    if (data.status === 'approved' && data.access_token && data.refresh_token) {
      // One-time handoff — clear tokens after first successful poll.
      await supabaseAdmin
        .from('login_qr_sessions')
        .update({
          status: 'consumed',
          consumed_at: new Date().toISOString(),
          access_token: null,
          refresh_token: null,
        })
        .eq('ref', ref)
        .eq('status', 'approved');

      return res.json({
        status: 'approved',
        session: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user_json,
        },
      });
    }

    return res.json({ status: data.status });
  })
);

router.post(
  '/login-sessions/:ref/approve',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ref = decodeURIComponent(String(req.params.ref || '')).trim();
    const userId = req.userId!;

    const { data: row, error } = await supabaseAdmin
      .from('login_qr_sessions')
      .select('*')
      .eq('ref', ref)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!row) {
      return res.status(404).json({ error: 'Invalid QR code. Ask desktop to refresh.' });
    }
    if (row.status !== 'pending') {
      return res.status(409).json({ error: 'This QR code was already used or expired.' });
    }
    if (new Date(row.expires_at) < new Date()) {
      await supabaseAdmin.from('login_qr_sessions').update({ status: 'expired' }).eq('ref', ref);
      return res.status(410).json({ error: 'QR code expired. Ask desktop to refresh.' });
    }

    let minted: { session: { access_token: string; refresh_token: string }; user: unknown };
    try {
      minted = await mintSessionForUserId(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not authorize desktop login';
      return res.status(500).json({ error: message });
    }

    const { error: updErr } = await supabaseAdmin
      .from('login_qr_sessions')
      .update({
        status: 'approved',
        user_id: userId,
        access_token: minted.session.access_token,
        refresh_token: minted.session.refresh_token,
        user_json: minted.user,
        approved_at: new Date().toISOString(),
      })
      .eq('ref', ref)
      .eq('status', 'pending');

    if (updErr) return res.status(500).json({ error: updErr.message });

    // Register the desktop install so it appears under Logged-in devices immediately.
    const installId =
      (typeof row.installation_id === 'string' && row.installation_id.trim()) ||
      `desktop_${ref}`;
    const now = new Date().toISOString();
    const label =
      (typeof row.device_label === 'string' && row.device_label.trim()) ||
      'ChatReel · Desktop (QR)';
    const platform =
      (typeof row.device_platform === 'string' && row.device_platform.trim()) || 'web';

    await supabaseAdmin.from('account_trusted_devices').upsert(
      {
        user_id: userId,
        installation_id: installId.slice(0, 128),
        label: label.slice(0, 80),
        platform: platform.slice(0, 40),
        device_name: 'Linked via QR',
        trusted_at: now,
        last_seen_at: now,
        revoked_at: null,
      },
      { onConflict: 'user_id,installation_id' }
    );

    return res.json({ success: true });
  })
);

/* ------------------------------------------------------------------ */
/*  Existing: link two already-logged-in accounts via QR              */
/* ------------------------------------------------------------------ */

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

    // Prefer WhatsApp-style login approval when the QR is a login session.
    if (cleanRef.startsWith('lq_') || cleanRef.startsWith('login_')) {
      const { data: loginRow } = await supabaseAdmin
        .from('login_qr_sessions')
        .select('ref, status, expires_at')
        .eq('ref', cleanRef)
        .maybeSingle();

      if (loginRow) {
        // Reuse approve logic via internal call shape — redirect client to approve endpoint.
        return res.status(400).json({
          error: 'This is a desktop login QR. Use the login approve flow.',
          login_ref: cleanRef,
        });
      }
    }

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

    await supabaseAdmin.from('qr_sessions').delete().eq('ref', cleanRef);

    return res.json({ success: true, owner_user_id: ownerId });
  })
);

export default router;
