import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, type AuthedRequest } from '../middleware/auth';
import { emitToUser } from '../realtime/wsGateway';
import {
  getUserPrivacyLock,
  upsertUserPrivacyLock,
} from '../services/privacyLock.service';

const router = Router();

const patchSchema = z.object({
  app_lock_enabled: z.boolean().optional(),
  chat_lock_enabled: z.boolean().optional(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const row = await getUserPrivacyLock(req.userId!);
    return res.json({
      app_lock_enabled: row.app_lock_enabled,
      chat_lock_enabled: row.chat_lock_enabled,
      updated_at: row.updated_at,
    });
  })
);

router.patch(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = patchSchema.parse(req.body ?? {});
    if (
      typeof body.app_lock_enabled !== 'boolean' &&
      typeof body.chat_lock_enabled !== 'boolean'
    ) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const row = await upsertUserPrivacyLock(req.userId!, body);
    const payload = {
      type: 'privacy_lock.updated',
      app_lock_enabled: row.app_lock_enabled,
      chat_lock_enabled: row.chat_lock_enabled,
      updated_at: row.updated_at,
    };
    emitToUser(req.userId!, payload);

    return res.json(payload);
  })
);

export default router;
