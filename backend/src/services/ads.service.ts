import { env } from '../config/env';
import { applyReelsCdnUrl } from '../lib/reelUrls';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import type { EnrichedReel } from './reels.service';

export type AdCampaignRow = {
  id: string;
  advertiser_name: string;
  caption: string | null;
  media_url: string;
  media_type: 'video' | 'image';
  thumbnail_url: string | null;
  avatar_url: string | null;
  cta_url: string | null;
  cta_label: string;
  status: 'draft' | 'active' | 'paused' | 'ended';
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  impression_count: number;
  click_count: number;
  created_at: string;
  updated_at: string;
};

export type SponsoredReel = EnrichedReel & {
  is_sponsored: true;
  ad_campaign_id: string;
  cta_url: string | null;
  cta_label: string;
  advertiser_name: string;
};

export type FeedReelItem = EnrichedReel | SponsoredReel;

export type AdsConfig = {
  enabled: boolean;
  every_n: number;
  placement_reels: boolean;
  placement_explore: boolean;
};

export function getAdsConfig(): AdsConfig {
  return {
    enabled: env.ads.enabled,
    every_n: env.ads.everyN,
    placement_reels: env.ads.placementReels,
    placement_explore: env.ads.placementExplore,
  };
}

function isCampaignLive(row: AdCampaignRow, nowMs: number): boolean {
  if (row.status !== 'active') return false;
  if (row.starts_at && new Date(row.starts_at).getTime() > nowMs) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() < nowMs) return false;
  return true;
}

export async function listActiveCampaigns(limit = 20): Promise<AdCampaignRow[]> {
  const { data, error } = await supabaseAdmin
    .from('ad_campaigns')
    .select('*')
    .eq('status', 'active')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) {
    // Table may not exist yet before migration — fail soft so feeds still work.
    console.warn('[ads] listActiveCampaigns:', error.message);
    return [];
  }

  const now = Date.now();
  return ((data ?? []) as AdCampaignRow[]).filter((row) => isCampaignLive(row, now));
}

export function campaignToSponsoredReel(row: AdCampaignRow): SponsoredReel {
  const mediaUrl = applyReelsCdnUrl(row.media_url) ?? row.media_url;
  const thumb = applyReelsCdnUrl(row.thumbnail_url) ?? row.thumbnail_url;
  const avatar = applyReelsCdnUrl(row.avatar_url) ?? row.avatar_url;
  const mediaType = row.media_type === 'image' ? 'image' : 'video';

  return {
    id: row.id,
    author_id: row.id,
    video_url: mediaUrl,
    hls_url: null,
    playback_url: mediaUrl,
    transcode_status: 'skipped',
    moderation_status: 'approved',
    moderation_reason: null,
    moderation_score: null,
    thumbnail_url: thumb,
    caption: row.caption,
    duration: null,
    visibility: 'public',
    group_id: null,
    width: null,
    height: null,
    view_count: Number(row.impression_count) || 0,
    like_count: 0,
    comment_count: 0,
    sound_id: null,
    sound_start_sec: null,
    original_audio_volume: null,
    sound_volume: null,
    scheduled_publish_at: null,
    created_at: row.created_at,
    liked_by_me: false,
    sound: null,
    author: {
      id: row.id,
      user_id: row.id,
      display_name: row.advertiser_name,
      email: null,
      avatar_url: avatar,
    },
    media: [
      {
        id: `${row.id}-media`,
        reel_id: row.id,
        position: 0,
        media_url: mediaUrl,
        media_type: mediaType,
        thumbnail_url: thumb,
        duration: null,
        width: null,
        height: null,
        hls_url: null,
        transcode_status: 'skipped',
        playback_url: mediaUrl,
      },
    ],
    is_sponsored: true,
    ad_campaign_id: row.id,
    cta_url: row.cta_url,
    cta_label: row.cta_label || 'Learn more',
    advertiser_name: row.advertiser_name,
  };
}

/**
 * Insert a sponsored item after every `everyN` organic reels.
 * Skips campaigns already present in `excludeIds` (prior pages).
 */
export function injectSponsoredIntoFeed(
  organic: EnrichedReel[],
  campaigns: AdCampaignRow[],
  opts: { everyN: number; excludeIds?: Set<string> }
): FeedReelItem[] {
  const everyN = Math.max(1, Math.floor(opts.everyN));
  const exclude = opts.excludeIds ?? new Set<string>();
  const pool = campaigns
    .filter((c) => !exclude.has(c.id))
    .map(campaignToSponsoredReel);

  if (!organic.length || !pool.length) return organic;

  const out: FeedReelItem[] = [];
  let adIdx = 0;
  for (let i = 0; i < organic.length; i += 1) {
    out.push(organic[i]!);
    if ((i + 1) % everyN === 0 && adIdx < pool.length) {
      out.push(pool[adIdx]!);
      adIdx += 1;
    }
  }
  return out;
}

export async function createCampaign(input: {
  advertiser_name: string;
  caption?: string | null;
  media_url: string;
  media_type?: 'video' | 'image';
  thumbnail_url?: string | null;
  avatar_url?: string | null;
  cta_url?: string | null;
  cta_label?: string;
  status?: 'draft' | 'active' | 'paused' | 'ended';
  starts_at?: string | null;
  ends_at?: string | null;
  priority?: number;
}): Promise<AdCampaignRow> {
  const now = new Date().toISOString();
  const row = {
    advertiser_name: input.advertiser_name.trim(),
    caption: input.caption?.trim() || null,
    media_url: input.media_url.trim(),
    media_type: input.media_type ?? 'video',
    thumbnail_url: input.thumbnail_url?.trim() || null,
    avatar_url: input.avatar_url?.trim() || null,
    cta_url: input.cta_url?.trim() || null,
    cta_label: (input.cta_label?.trim() || 'Learn more').slice(0, 40),
    status: input.status ?? 'draft',
    starts_at: input.starts_at ?? null,
    ends_at: input.ends_at ?? null,
    priority: Number.isFinite(input.priority) ? Number(input.priority) : 0,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('ad_campaigns')
    .insert(row)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as AdCampaignRow;
}

export async function updateCampaignStatus(
  id: string,
  status: AdCampaignRow['status']
): Promise<AdCampaignRow | null> {
  const { data, error } = await supabaseAdmin
    .from('ad_campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AdCampaignRow | null) ?? null;
}

export async function trackAdEvent(opts: {
  campaignId: string;
  profileId: string | null;
  eventType: 'impression' | 'click' | 'cta';
  placement?: string;
}): Promise<void> {
  const placement = opts.placement || 'reels_feed';
  const { error } = await supabaseAdmin.from('ad_events').insert({
    campaign_id: opts.campaignId,
    profile_id: opts.profileId,
    event_type: opts.eventType,
    placement,
  });
  if (error) {
    console.warn('[ads] trackAdEvent insert:', error.message);
    return;
  }

  if (opts.eventType === 'impression') {
    const { error: rpcErr } = await supabaseAdmin.rpc('increment_ad_impression', {
      p_campaign_id: opts.campaignId,
    });
    if (rpcErr) {
      const { data } = await supabaseAdmin
        .from('ad_campaigns')
        .select('impression_count')
        .eq('id', opts.campaignId)
        .maybeSingle();
      const next = (Number(data?.impression_count) || 0) + 1;
      await supabaseAdmin
        .from('ad_campaigns')
        .update({ impression_count: next, updated_at: new Date().toISOString() })
        .eq('id', opts.campaignId);
    }
  } else if (opts.eventType === 'click' || opts.eventType === 'cta') {
    const { error: rpcErr } = await supabaseAdmin.rpc('increment_ad_click', {
      p_campaign_id: opts.campaignId,
    });
    if (rpcErr) {
      const { data } = await supabaseAdmin
        .from('ad_campaigns')
        .select('click_count')
        .eq('id', opts.campaignId)
        .maybeSingle();
      const next = (Number(data?.click_count) || 0) + 1;
      await supabaseAdmin
        .from('ad_campaigns')
        .update({ click_count: next, updated_at: new Date().toISOString() })
        .eq('id', opts.campaignId);
    }
  }
}

/** Public card shape for Explore native placements. */
export type ExploreAdCard = {
  id: string;
  advertiser_name: string;
  caption: string | null;
  media_url: string;
  media_type: 'video' | 'image';
  thumbnail_url: string | null;
  avatar_url: string | null;
  cta_url: string | null;
  cta_label: string;
  is_sponsored: true;
};

export function campaignToExploreCard(row: AdCampaignRow): ExploreAdCard {
  return {
    id: row.id,
    advertiser_name: row.advertiser_name,
    caption: row.caption,
    media_url: applyReelsCdnUrl(row.media_url) ?? row.media_url,
    media_type: row.media_type,
    thumbnail_url: applyReelsCdnUrl(row.thumbnail_url) ?? row.thumbnail_url,
    avatar_url: applyReelsCdnUrl(row.avatar_url) ?? row.avatar_url,
    cta_url: row.cta_url,
    cta_label: row.cta_label || 'Learn more',
    is_sponsored: true,
  };
}
