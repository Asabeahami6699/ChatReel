import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';
import {
  createTrimmedRingtone,
  deleteUserRingtone,
  getSelectedRingtoneId,
  listUserRingtones,
  setSelectedRingtoneId,
} from '../services/userRingtones.service';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const [ringtones, selected_id] = await Promise.all([
      listUserRingtones(userId),
      getSelectedRingtoneId(userId),
    ]);
    return res.json({ ringtones, selected_id });
  })
);

const createSchema = z.object({
  label: z.string().min(1).max(80),
  source_path: z.string().min(1).max(400),
  start_sec: z.number().min(0).max(60 * 60 * 6),
  end_sec: z.number().min(0.5).max(60 * 60 * 6),
});

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createSchema.parse(req.body);
    if (body.end_sec <= body.start_sec) {
      return res.status(400).json({ error: 'Invalid trim range' });
    }
    // Only allow creating from this user's temp upload prefix.
    const prefix = `ringtones-src/${req.userId!}/`;
    if (!body.source_path.startsWith(prefix)) {
      return res.status(400).json({ error: 'Invalid source path' });
    }

    const ringtone = await createTrimmedRingtone({
      userId: req.userId!,
      label: body.label,
      sourcePath: body.source_path,
      startSec: body.start_sec,
      endSec: Math.min(body.end_sec, body.start_sec + 60),
    });

    await setSelectedRingtoneId(req.userId!, ringtone.id);
    return res.status(201).json({ ringtone, selected_id: ringtone.id });
  })
);

router.patch(
  '/selected',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        ringtone_id: z.string().uuid().nullable(),
      })
      .parse(req.body);
    const selected = await setSelectedRingtoneId(req.userId!, body.ringtone_id);
    return res.json({
      selected_id: selected?.id ?? null,
      ringtone: selected,
    });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await deleteUserRingtone(req.userId!, id);
    return res.json({ ok: true });
  })
);

export default router;
