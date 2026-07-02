import { Router } from 'express';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';
import { getGroupChats, getIndividualChats } from '../services/chats.service';

const router = Router();

router.get(
  '/individual',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const chats = await getIndividualChats(req.userId!);
    return res.json({ chats });
  })
);

router.get(
  '/groups',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const groups = await getGroupChats(req.userId!);
    return res.json({ groups });
  })
);

export default router;
