import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  asyncHandler,
  AuthedRequest,
  getProfileIdByUserId,
  requireAuth,
} from '../middleware/auth';
import { canViewReel } from '../services/reels.service';
import {
  claimWelcomeBonus,
  getWalletBalance,
  listGiftCatalog,
  listReelGiftsForReel,
  listWalletLedger,
  sendCallGiftSecure,
  sendReelGiftSecure,
} from '../services/gifts.service';
import { isJoinedParticipant } from '../services/calls.service';
import { getAcceptedFriendIds } from '../services/reels.service';
import { sendPushToUserSafe, getAuthUserIdByProfileId } from '../services/push.service';

const router = Router();

const sendGiftSchema = z.object({
  reel_id: z.string().uuid(),
  gift_id: z.string().uuid(),
  idempotency_key: z.string().min(8).max(128),
});

const sendCallGiftSchema = z.object({
  call_id: z.string().uuid(),
  recipient_user_id: z.string().uuid(),
  gift_id: z.string().uuid(),
  idempotency_key: z.string().min(8).max(128),
});

function isValidIdempotencyKey(key: string): boolean {
  if (key.length < 8 || key.length > 128) return false;
  return /^[a-zA-Z0-9:_-]+$/.test(key);
}

/** Simple in-memory rate limit: max sends per profile per minute. */
const sendRateMap = new Map<string, { count: number; resetAt: number }>();
const SEND_RATE_LIMIT = 40;
const SEND_RATE_WINDOW_MS = 60_000;

function checkSendRate(profileId: string): boolean {
  const now = Date.now();
  const entry = sendRateMap.get(profileId);
  if (!entry || now >= entry.resetAt) {
    sendRateMap.set(profileId, { count: 1, resetAt: now + SEND_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= SEND_RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

/* -------------------------------------------------------------------------- */
/*  GET /gifts/catalog                                                        */
/* -------------------------------------------------------------------------- */
router.get(
  '/catalog',
  requireAuth,
  asyncHandler(async (_req: AuthedRequest, res) => {
    const gifts = await listGiftCatalog();
    return res.json({ gifts });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /gifts/send — atomic ledger debit/credit via DB function             */
/* -------------------------------------------------------------------------- */
router.post(
  '/send',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const body = sendGiftSchema.parse(req.body);
    if (!isValidIdempotencyKey(body.idempotency_key)) {
      return res.status(400).json({ error: 'Invalid idempotency key' });
    }

    if (!checkSendRate(profileId)) {
      return res.status(429).json({ error: 'Too many gifts sent. Try again in a minute.' });
    }

    const { data: reel, error: reelErr } = await supabaseAdmin
      .from('reels')
      .select('*')
      .eq('id', body.reel_id)
      .maybeSingle();
    if (reelErr) return res.status(500).json({ error: reelErr.message });
    if (!reel) return res.status(404).json({ error: 'Reel not found' });

    const friendIds = await getAcceptedFriendIds(profileId);
    const allowed = await canViewReel(reel, profileId, friendIds, req.userId!);
    if (!allowed) return res.status(403).json({ error: 'You cannot gift this reel' });

    try {
      const result = await sendReelGiftSecure({
        senderProfileId: profileId,
        reelId: body.reel_id,
        giftId: body.gift_id,
        idempotencyKey: body.idempotency_key,
      });

      if (!result.duplicate && result.catalog) {
        const recipientAuthId = await getAuthUserIdByProfileId(reel.author_id as string);
        if (recipientAuthId && recipientAuthId !== req.userId) {
          void sendPushToUserSafe(recipientAuthId, {
            title: 'New gift on your reel',
            body: `Someone sent ${result.catalog.emoji} ${result.catalog.name}`,
            data: {
              type: 'reel_gift',
              reel_id: body.reel_id,
              screen: 'ReelInbox',
            },
          });
        }
      }

      return res.status(result.duplicate ? 200 : 201).json({
        gift: result.gift,
        catalog: result.catalog ?? null,
        sender_balance_coins: result.sender_balance_coins,
        duplicate: result.duplicate,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send gift';
      if (message.includes('Insufficient')) return res.status(402).json({ error: message });
      if (message.includes('cannot gift')) return res.status(400).json({ error: message });
      return res.status(400).json({ error: message });
    }
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /gifts/send-call — tip a participant during an active call           */
/* -------------------------------------------------------------------------- */
router.post(
  '/send-call',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const body = sendCallGiftSchema.parse(req.body);
    if (!isValidIdempotencyKey(body.idempotency_key)) {
      return res.status(400).json({ error: 'Invalid idempotency key' });
    }
    if (!checkSendRate(profileId)) {
      return res.status(429).json({ error: 'Too many gifts sent. Try again in a minute.' });
    }

    const joined = await isJoinedParticipant(body.call_id, req.userId!);
    if (!joined) return res.status(403).json({ error: 'Join the call before tipping' });

    try {
      const result = await sendCallGiftSecure({
        senderProfileId: profileId,
        callId: body.call_id,
        recipientUserId: body.recipient_user_id,
        giftId: body.gift_id,
        idempotencyKey: body.idempotency_key,
      });

      if (!result.duplicate && result.catalog && body.recipient_user_id !== req.userId) {
        void sendPushToUserSafe(body.recipient_user_id, {
          title: 'Tip during your call',
          body: `Someone sent ${result.catalog.emoji} ${result.catalog.name}`,
          data: {
            type: 'call_gift',
            call_id: body.call_id,
          },
        });
      }

      return res.status(result.duplicate ? 200 : 201).json({
        gift: result.gift,
        catalog: result.catalog ?? null,
        sender_balance_coins: result.sender_balance_coins,
        duplicate: result.duplicate,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send gift';
      if (message.includes('Insufficient')) return res.status(402).json({ error: message });
      if (message.includes('cannot gift')) return res.status(400).json({ error: message });
      return res.status(400).json({ error: message });
    }
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /gifts/reel/:reelId — recent gifts on a reel                          */
/* -------------------------------------------------------------------------- */
router.get(
  '/reel/:reelId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const reelId = z.string().uuid().parse(req.params.reelId);
    const { data: reel } = await supabaseAdmin.from('reels').select('*').eq('id', reelId).maybeSingle();
    if (!reel) return res.status(404).json({ error: 'Reel not found' });

    const friendIds = await getAcceptedFriendIds(profileId);
    const allowed = await canViewReel(reel, profileId, friendIds, req.userId!);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const gifts = await listReelGiftsForReel(reelId, Number(req.query.limit ?? 20));
    return res.json({ gifts });
  })
);

export default router;
