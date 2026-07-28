import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const keyTypeSchema = z.enum([
  'identity',
  'signed_prekey',
  'identity_x25519',
  'signing',
]);

async function upsertKey(opts: {
  userId: string;
  public_key: string;
  type: z.infer<typeof keyTypeSchema>;
  key_id?: number | null;
  signature?: string | null;
  registration_id?: number | null;
}) {
  const { data: existing } = await supabaseAdmin
    .from('public_keys')
    .select('id, public_key, type, key_id, signature, registration_id, created_at')
    .eq('user_id', opts.userId)
    .eq('type', opts.type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const patch = {
    public_key: opts.public_key,
    key_id: opts.key_id ?? null,
    signature: opts.signature ?? null,
    registration_id: opts.registration_id ?? null,
  };

  if (existing?.id) {
    const same =
      existing.public_key === patch.public_key &&
      (existing.key_id ?? null) === patch.key_id &&
      (existing.signature ?? null) === patch.signature &&
      (existing.registration_id ?? null) === patch.registration_id;
    if (same) {
      await supabaseAdmin
        .from('public_keys')
        .delete()
        .eq('user_id', opts.userId)
        .eq('type', opts.type)
        .neq('id', existing.id);
      return { key: existing, unchanged: true as const };
    }

    const { data: updated, error } = await supabaseAdmin
      .from('public_keys')
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from('public_keys')
      .delete()
      .eq('user_id', opts.userId)
      .eq('type', opts.type)
      .neq('id', existing.id);
    return { key: updated, updated: true as const };
  }

  const { data, error } = await supabaseAdmin
    .from('public_keys')
    .insert({
      user_id: opts.userId,
      type: opts.type,
      ...patch,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { key: data, created: true as const };
}

router.get(
  '/:userId/identity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('public_keys')
      .select('public_key, type, created_at')
      .eq('user_id', req.params.userId)
      .eq('type', 'identity')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Identity key not found' });
    return res.json({ public_key: data.public_key });
  })
);

/** Signal X3DH prekey bundle for a peer (identity + SPK + optional OTP). */
router.get(
  '/:userId/bundle',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;

    const [{ data: ik }, { data: signing }, { data: spk }] = await Promise.all([
      supabaseAdmin
        .from('public_keys')
        .select('public_key, registration_id')
        .eq('user_id', userId)
        .eq('type', 'identity_x25519')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('public_keys')
        .select('public_key')
        .eq('user_id', userId)
        .eq('type', 'signing')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('public_keys')
        .select('public_key, key_id, signature, registration_id')
        .eq('user_id', userId)
        .eq('type', 'signed_prekey')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!ik?.public_key || !signing?.public_key || !spk?.public_key || !spk.signature) {
      return res.status(404).json({ error: 'Signal bundle not available' });
    }

    // Atomically claim one OTP if present.
    let oneTime: { key_id: number; public_key: string } | null = null;
    const { data: otpRows } = await supabaseAdmin
      .from('one_time_prekeys')
      .select('id, public_key, key_id')
      .eq('user_id', userId)
      .is('used_at', null)
      .not('key_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1);

    const otp = otpRows?.[0];
    if (otp?.id != null && otp.key_id != null) {
      const { data: claimed } = await supabaseAdmin
        .from('one_time_prekeys')
        .update({ used_at: new Date().toISOString() })
        .eq('id', otp.id)
        .is('used_at', null)
        .select('public_key, key_id')
        .maybeSingle();
      if (claimed?.key_id != null) {
        oneTime = { key_id: claimed.key_id as number, public_key: claimed.public_key as string };
      }
    }

    return res.json({
      identity_key: ik.public_key,
      signing_key: signing.public_key,
      registration_id: ik.registration_id ?? spk.registration_id ?? 1,
      signed_prekey: {
        key_id: spk.key_id ?? 1,
        public_key: spk.public_key,
        signature: spk.signature,
      },
      one_time_prekey: oneTime,
    });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        public_key: z.string().min(1),
        type: keyTypeSchema,
        key_id: z.number().int().positive().optional(),
        signature: z.string().optional(),
        registration_id: z.number().int().positive().optional(),
      })
      .parse(req.body);

    const userId = req.userId!;
    try {
      const result = await upsertKey({
        userId,
        public_key: body.public_key,
        type: body.type,
        key_id: body.key_id,
        signature: body.signature,
        registration_id: body.registration_id,
      });
      return res.status(result.created ? 201 : 200).json(result);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Key register failed',
      });
    }
  })
);

router.post(
  '/prekeys',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    // Legacy: string[] of pubs. Signal: { key_id, public_key }[]
    const body = z
      .union([
        z.object({ public_keys: z.array(z.string()).min(1).max(200) }),
        z.object({
          keys: z
            .array(
              z.object({
                key_id: z.number().int().positive(),
                public_key: z.string().min(1),
              })
            )
            .min(1)
            .max(200),
        }),
      ])
      .parse(req.body);

    const userId = req.userId!;
    const rows =
      'keys' in body
        ? body.keys.map((k) => ({
            user_id: userId,
            public_key: k.public_key,
            key_id: k.key_id,
          }))
        : body.public_keys.map((public_key) => ({
            user_id: userId,
            public_key,
            key_id: null as number | null,
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
