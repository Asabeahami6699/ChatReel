import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import {
  asyncHandler,
  AuthedRequest,
  getProfileIdByUserId,
  requireAuth,
} from '../middleware/auth';
import {
  campaignToExploreCard,
  createCampaign,
  getAdsConfig,
  listActiveCampaigns,
  trackAdEvent,
  updateCampaignStatus,
} from '../services/ads.service';

const router = Router();

function requireAdsAdmin(req: AuthedRequest, res: import('express').Response): boolean {
  const key = env.ads.adminKey;
  if (!key) {
    res.status(503).json({ error: 'Ads admin key not configured (ADS_ADMIN_KEY)' });
    return false;
  }
  const provided =
    (typeof req.headers['x-ads-admin-key'] === 'string' && req.headers['x-ads-admin-key']) ||
    (typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('AdsAdmin ')
      ? req.headers.authorization.slice('AdsAdmin '.length)
      : '');
  if (!provided || provided !== key) {
    res.status(401).json({ error: 'Invalid ads admin key' });
    return false;
  }
  return true;
}

const createSchema = z.object({
  advertiser_name: z.string().trim().min(1).max(80),
  caption: z.string().trim().max(500).nullish(),
  media_url: z.string().url().max(2000),
  media_type: z.enum(['video', 'image']).optional(),
  thumbnail_url: z.string().url().max(2000).nullish(),
  avatar_url: z.string().url().max(2000).nullish(),
  cta_url: z.string().url().max(2000).nullish(),
  cta_label: z.string().trim().min(1).max(40).optional(),
  status: z.enum(['draft', 'active', 'paused', 'ended']).optional(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  priority: z.number().int().min(-1000).max(1000).optional(),
});

const trackSchema = z.object({
  campaign_id: z.string().uuid(),
  event_type: z.enum(['impression', 'click', 'cta']),
  placement: z.enum(['reels_feed', 'explore']).optional(),
});

const statusSchema = z.object({
  status: z.enum(['draft', 'active', 'paused', 'ended']),
});

/** GET /config — remote kill-switch + frequency (public). */
router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({ ads: getAdsConfig() });
  })
);

/** GET /active — active campaigns for Explore cards (auth optional). */
router.get(
  '/active',
  asyncHandler(async (req: AuthedRequest, res) => {
    const config = getAdsConfig();
    if (!config.enabled || !config.placement_explore) {
      return res.json({ ads: [], config });
    }
    const campaigns = await listActiveCampaigns(12);
    return res.json({
      ads: campaigns.map(campaignToExploreCard),
      config,
    });
  })
);

/** POST /track — impression / CTA events. */
router.post(
  '/track',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = trackSchema.parse(req.body);
    const profileId = await getProfileIdByUserId(req.userId!);
    await trackAdEvent({
      campaignId: body.campaign_id,
      profileId,
      eventType: body.event_type,
      placement: body.placement,
    });
    return res.json({ ok: true });
  })
);

/** POST / — create campaign (admin key). */
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!requireAdsAdmin(req, res)) return;
    const body = createSchema.parse(req.body);
    const campaign = await createCampaign(body);
    return res.status(201).json({ campaign });
  })
);

/** GET /admin — list active + recent (admin key). */
router.get(
  '/admin',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!requireAdsAdmin(req, res)) return;
    const { data, error } = await (
      await import('../lib/supabaseAdmin')
    ).supabaseAdmin
      .from('ad_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ campaigns: data ?? [], config: getAdsConfig() });
  })
);

/** PATCH /:id/status — activate / pause (admin key). */
router.patch(
  '/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!requireAdsAdmin(req, res)) return;
    const id = z.string().uuid().parse(req.params.id);
    const body = statusSchema.parse(req.body);
    const campaign = await updateCampaignStatus(id, body.status);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    return res.json({ campaign });
  })
);

export default router;
