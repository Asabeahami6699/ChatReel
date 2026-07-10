import { Router } from 'express';
import { z } from 'zod';
import { env, isPaystackConfigured } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  asyncHandler,
  AuthedRequest,
  getProfileIdByUserId,
  requireAuth,
} from '../middleware/auth';
import {
  claimWelcomeBonus,
  getWalletBalance,
  listWalletLedger,
} from '../services/gifts.service';
import {
  initializeCoinPurchase,
  listCoinPackagesForProfile,
  verifyCoinPurchase,
} from '../services/coinPurchases.service';
import { paymentProviderForCountry } from '../services/countryCodes';

const router = Router();

const purchaseInitSchema = z.object({
  package_id: z.string().uuid(),
});

const purchaseVerifySchema = z.object({
  reference: z.string().min(8).max(120),
});

router.get(
  '/balance',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const wallet = await getWalletBalance(profileId);
    return res.json({
      balance_coins: wallet.balance_coins,
      lifetime_earned_coins: wallet.lifetime_earned_coins,
      lifetime_spent_coins: wallet.lifetime_spent_coins,
      welcome_claimed: Boolean(wallet.welcome_claimed_at),
    });
  })
);

router.get(
  '/packages',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    try {
      const result = await listCoinPackagesForProfile(profileId);
      const provider = paymentProviderForCountry(
        result.fallback_used ? 'NG' : result.resolved_country
      );

      if (result.packages.length === 0) {
        return res.status(503).json({
          error: 'No coin packages available. Run Supabase migrations 028–030.',
          packages: [],
          resolved_country: result.resolved_country,
          currency: result.currency,
          payment_provider: provider,
          fallback_used: result.fallback_used,
          paystack_public_key:
            provider === 'paystack' && isPaystackConfigured() ? env.paystack.publicKey : null,
        });
      }

      return res.json({
        packages: result.packages,
        resolved_country: result.resolved_country,
        currency: result.currency,
        payment_provider: provider,
        fallback_used: result.fallback_used,
        paystack_public_key:
          provider === 'paystack' && isPaystackConfigured() ? env.paystack.publicKey : null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load coin packages';
      return res.status(503).json({ error: message });
    }
  })
);

router.post(
  '/purchase/initialize',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const body = purchaseInitSchema.parse(req.body);
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', profileId)
      .maybeSingle();
    const email = profile?.email?.trim() || `${req.userId}@chatreel.app`;

    try {
      const checkout = await initializeCoinPurchase({
        profileId,
        email,
        packageId: body.package_id,
      });
      return res.json(checkout);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start checkout';
      return res.status(400).json({ error: message });
    }
  })
);

router.post(
  '/purchase/verify',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const body = purchaseVerifySchema.parse(req.body);

    const { data: purchase } = await supabaseAdmin
      .from('coin_purchases')
      .select('profile_id')
      .eq('payment_reference', body.reference)
      .maybeSingle();
    if (!purchase || purchase.profile_id !== profileId) {
      return res.status(403).json({ error: 'Purchase not found' });
    }

    try {
      const result = await verifyCoinPurchase(body.reference);
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      return res.status(400).json({ error: message });
    }
  })
);

router.get(
  '/ledger',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const limit = Math.min(Number(req.query.limit ?? 30), 50);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const { entries, next_cursor } = await listWalletLedger(profileId, limit, cursor);
    return res.json({ entries, next_cursor });
  })
);

router.post(
  '/welcome',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const result = await claimWelcomeBonus(profileId);
    return res.json(result);
  })
);

export default router;
