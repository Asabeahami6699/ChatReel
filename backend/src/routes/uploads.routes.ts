import express, { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  ensureStorageBucket,
  guessImageContentType,
  normalizeBase64,
  STORAGE_BUCKETS,
} from '../lib/storageBuckets';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.post(
  '/binary',
  requireAuth,
  express.raw({ type: () => true, limit: '100mb' }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const bucket = z.enum(STORAGE_BUCKETS).parse(req.query.bucket);
    const path = z.string().min(1).parse(req.query.path);
    const contentType =
      typeof req.query.content_type === 'string' ? req.query.content_type : undefined;

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'Empty upload body' });
    }

    await ensureStorageBucket(bucket);

    const resolvedType =
      bucket === 'avatars' || bucket === 'group_avatar'
        ? guessImageContentType(path, contentType)
        : contentType || 'application/octet-stream';

    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, body, {
      contentType: resolvedType,
      upsert: false,
    });

    if (error) {
      console.error('[uploads/binary]', bucket, path, error.message);
      return res.status(500).json({ error: error.message });
    }

    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return res.json({ publicUrl: data.publicUrl, path });
  })
);

router.post(
  '/upload',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        bucket: z.enum(STORAGE_BUCKETS),
        path: z.string().min(1),
        content_base64: z.string().min(1),
        content_type: z.string().optional(),
        upsert: z.boolean().optional(),
      })
      .parse(req.body);

    await ensureStorageBucket(body.bucket);

    const base64 = normalizeBase64(body.content_base64);
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ error: 'Invalid or empty file data' });
    }

    const contentType =
      body.bucket === 'avatars' || body.bucket === 'group_avatar'
        ? guessImageContentType(body.path, body.content_type)
        : body.content_type;

    const { error } = await supabaseAdmin.storage.from(body.bucket).upload(body.path, buffer, {
      contentType,
      upsert: body.upsert ?? true,
    });

    if (error) {
      console.error('[uploads]', body.bucket, body.path, error.message);
      return res.status(500).json({ error: error.message });
    }

    const { data } = supabaseAdmin.storage.from(body.bucket).getPublicUrl(body.path);
    return res.json({ publicUrl: data.publicUrl, path: body.path });
  })
);

router.post(
  '/sign',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        bucket: z.enum(STORAGE_BUCKETS),
        path: z.string().min(1),
      })
      .parse(req.body);

    await ensureStorageBucket(body.bucket);

    const { data, error } = await supabaseAdmin.storage
      .from(body.bucket)
      .createSignedUploadUrl(body.path);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ signedUrl: data.signedUrl, path: data.path, token: data.token });
  })
);

router.get(
  '/public-url',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bucket = z.enum(STORAGE_BUCKETS).parse(req.query.bucket);
    const path = z.string().parse(req.query.path);

    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return res.json({ publicUrl: data.publicUrl });
  })
);

export default router;
