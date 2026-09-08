import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, requireAuth, type AuthedRequest } from '../middleware/auth';

const router = Router();

const DEVICE_SELECT =
  'id, installation_id, label, platform, device_name, trusted_at, last_seen_at, revoked_at' as const;

type TrustedDeviceRow = {
  id: string;
  installation_id: string;
  label: string | null;
  platform: string | null;
  device_name: string | null;
  trusted_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
};

const registerSchema = z.object({
  installation_id: z.string().min(8).max(128),
  label: z.string().max(80).optional(),
  platform: z.string().max(40).optional(),
  device_name: z.string().max(80).optional(),
});

/**
 * Register / refresh this installation as an active login device.
 */
router.post(
  '/register',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = registerSchema.parse(req.body);
    const userId = req.userId!;
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('account_trusted_devices')
      .upsert(
        {
          user_id: userId,
          installation_id: body.installation_id,
          label: body.label?.slice(0, 80) || body.platform || 'Device',
          platform: body.platform ?? null,
          device_name: body.device_name ?? null,
          trusted_at: now,
          last_seen_at: now,
          revoked_at: null,
        },
        { onConflict: 'user_id,installation_id' }
      )
      .select(DEVICE_SELECT)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ device: data as TrustedDeviceRow });
  })
);

/**
 * Heartbeat: update last_seen, or report revoked so the client signs out.
 */
router.post(
  '/heartbeat',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({ installation_id: z.string().min(8).max(128) })
      .parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('account_trusted_devices')
      .select(DEVICE_SELECT)
      .eq('user_id', req.userId!)
      .eq('installation_id', body.installation_id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    const device = data as TrustedDeviceRow | null;
    if (!device) {
      // Unknown installation — register lightly so the list isn't empty.
      return res.json({ ok: true, revoked: false, unknown: true });
    }

    if (device.revoked_at) {
      return res.json({
        ok: false,
        revoked: true,
        message: 'This device was signed out remotely.',
      });
    }

    await supabaseAdmin
      .from('account_trusted_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', device.id);

    return res.json({ ok: true, revoked: false, device });
  })
);

/**
 * List active (non-revoked) login devices + QR-linked account pairings.
 */
router.get(
  '/devices',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const installationId =
      typeof req.query.installation_id === 'string' ? req.query.installation_id : null;
    const userId = req.userId!;

    const { data, error } = await supabaseAdmin
      .from('account_trusted_devices')
      .select(DEVICE_SELECT)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const devices = ((data ?? []) as TrustedDeviceRow[]).map((d) => ({
      ...d,
      is_current: Boolean(installationId && d.installation_id === installationId),
      kind: 'session' as const,
    }));

    const { data: links, error: linkErr } = await supabaseAdmin
      .from('linked_devices')
      .select('id, user_id, linked_user_id, linked_at')
      .or(`user_id.eq.${userId},linked_user_id.eq.${userId}`)
      .order('linked_at', { ascending: false });

    if (linkErr) {
      // Table missing shouldn't break the sessions list.
      console.warn('[sessions] linked_devices list failed:', linkErr.message);
      return res.json({ devices, linked: [] });
    }

    const peerIds = Array.from(
      new Set(
        (links ?? []).map((row) =>
          row.user_id === userId ? row.linked_user_id : row.user_id
        )
      )
    );

    let profileByUser = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    if (peerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', peerIds);
      profileByUser = new Map(
        (profiles ?? []).map((p) => [
          p.user_id as string,
          {
            display_name: (p.display_name as string | null) ?? null,
            avatar_url: (p.avatar_url as string | null) ?? null,
          },
        ])
      );
    }

    const linked = (links ?? []).map((row) => {
      const peerId = row.user_id === userId ? row.linked_user_id : row.user_id;
      const profile = profileByUser.get(peerId);
      return {
        id: row.id as string,
        peer_user_id: peerId as string,
        label: profile?.display_name?.trim() || 'Linked account',
        avatar_url: profile?.avatar_url ?? null,
        linked_at: row.linked_at as string,
        kind: 'linked' as const,
      };
    });

    return res.json({ devices, linked });
  })
);

/**
 * Remove a QR account-link pairing.
 */
router.delete(
  '/linked/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data, error } = await supabaseAdmin
      .from('linked_devices')
      .delete()
      .eq('id', id)
      .or(`user_id.eq.${userId},linked_user_id.eq.${userId}`)
      .select('id')
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Linked device not found' });

    return res.json({ ok: true });
  })
);

/**
 * Sign out one device (marks revoked — that install signs out on heartbeat).
 */
router.delete(
  '/devices/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('account_trusted_devices')
      .update({ revoked_at: now })
      .eq('user_id', req.userId!)
      .eq('id', id)
      .is('revoked_at', null)
      .select(DEVICE_SELECT)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Device not found' });

    return res.json({ ok: true, device: data as TrustedDeviceRow });
  })
);

/**
 * Sign out every other device; keep the current installation active.
 * Does NOT globally invalidate the current refresh token.
 */
router.post(
  '/logout-others',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        keep_installation_id: z.string().min(8).max(128),
      })
      .parse(req.body ?? {});

    const userId = req.userId!;
    const now = new Date().toISOString();

    // Ensure current device exists and is active.
    await supabaseAdmin.from('account_trusted_devices').upsert(
      {
        user_id: userId,
        installation_id: body.keep_installation_id,
        label: 'This device',
        last_seen_at: now,
        revoked_at: null,
      },
      { onConflict: 'user_id,installation_id' }
    );

    const { data: others, error } = await supabaseAdmin
      .from('account_trusted_devices')
      .update({ revoked_at: now })
      .eq('user_id', userId)
      .neq('installation_id', body.keep_installation_id)
      .is('revoked_at', null)
      .select('id');

    if (error) return res.status(500).json({ error: error.message });

    // Invalidate other refresh tokens immediately (keeps this device's session).
    const jwt = req.accessToken;
    if (jwt && (others?.length ?? 0) > 0) {
      const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(jwt, 'others');
      if (signOutErr) {
        console.warn('[sessions] admin.signOut(others) failed:', signOutErr.message);
      }
    }

    return res.json({
      ok: true,
      revoked_count: others?.length ?? 0,
      message:
        (others?.length ?? 0) > 0
          ? `Signed out ${others!.length} other device${others!.length === 1 ? '' : 's'}.`
          : 'No other devices to sign out.',
    });
  })
);

/**
 * Remote wipe: revoke every device (including this one) + invalidate refresh tokens.
 * Client must clear local caches and sign out.
 */
router.post(
  '/remote-wipe',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const now = new Date().toISOString();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('session_epoch')
      .eq('user_id', userId)
      .maybeSingle();

    const nextEpoch = Number(profile?.session_epoch ?? 0) + 1;
    await supabaseAdmin
      .from('profiles')
      .update({ session_epoch: nextEpoch, updated_at: now })
      .eq('user_id', userId);

    await supabaseAdmin
      .from('account_trusted_devices')
      .update({ revoked_at: now })
      .eq('user_id', userId)
      .is('revoked_at', null);

    // admin.signOut expects a JWT (not user id). Scope "global" revokes all refresh tokens.
    const jwt = req.accessToken;
    if (jwt) {
      const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(jwt, 'global');
      if (signOutErr) {
        console.warn('[sessions] admin.signOut failed:', signOutErr.message);
      }
    }

    await supabaseAdmin
      .from('linked_devices')
      .delete()
      .or(`user_id.eq.${userId},linked_user_id.eq.${userId}`);

    return res.json({
      ok: true,
      session_epoch: nextEpoch,
      wipe: true,
      message: 'All sessions wiped. Sign in again on this device.',
    });
  })
);

export default router;
