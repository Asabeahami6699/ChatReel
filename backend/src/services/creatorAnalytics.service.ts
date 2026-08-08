import { supabaseAdmin } from '../lib/supabaseAdmin';

export type CreatorAnalyticsDTO = {
  total_reels: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  gift_count: number;
  gift_coins_earned: number;
  lifetime_earned_coins: number;
  cashable_coins: number;
  balance_coins: number;
  top_reels: Array<{
    id: string;
    caption: string | null;
    thumbnail_url: string | null;
    view_count: number;
    like_count: number;
    gift_count: number;
    gift_coin_total: number;
    created_at: string;
  }>;
};

export async function getCreatorAnalytics(profileId: string): Promise<CreatorAnalyticsDTO> {
  const [{ data: reels }, { data: wallet }, { data: giftAgg }] = await Promise.all([
    supabaseAdmin
      .from('reels')
      .select(
        'id, caption, thumbnail_url, view_count, like_count, comment_count, gift_count, gift_coin_total, created_at'
      )
      .eq('author_id', profileId)
      .order('view_count', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('wallet_accounts')
      .select('balance_coins, cashable_coins, lifetime_earned_coins')
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabaseAdmin
      .from('reel_gifts')
      .select('creator_coins')
      .eq('recipient_profile_id', profileId)
      .limit(5000),
  ]);

  const list = reels ?? [];
  const totalViews = list.reduce((s, r) => s + Number(r.view_count ?? 0), 0);
  const totalLikes = list.reduce((s, r) => s + Number(r.like_count ?? 0), 0);
  const totalComments = list.reduce((s, r) => s + Number(r.comment_count ?? 0), 0);
  const giftCount = list.reduce((s, r) => s + Number(r.gift_count ?? 0), 0);
  const giftCoinsFromReels = list.reduce((s, r) => s + Number(r.gift_coin_total ?? 0), 0);
  // Prefer ledger creator_coins when available; fall back to reel denormalized totals.
  const giftCoinsFromRows = (giftAgg ?? []).reduce(
    (s, g) => s + Number(g.creator_coins ?? 0),
    0
  );

  return {
    total_reels: list.length,
    total_views: totalViews,
    total_likes: totalLikes,
    total_comments: totalComments,
    gift_count: giftCount,
    gift_coins_earned: giftCoinsFromRows || giftCoinsFromReels,
    lifetime_earned_coins: Number(wallet?.lifetime_earned_coins ?? 0),
    cashable_coins: Number(wallet?.cashable_coins ?? 0),
    balance_coins: Number(wallet?.balance_coins ?? 0),
    top_reels: list.slice(0, 8).map((r) => ({
      id: r.id,
      caption: r.caption ?? null,
      thumbnail_url: r.thumbnail_url ?? null,
      view_count: Number(r.view_count ?? 0),
      like_count: Number(r.like_count ?? 0),
      gift_count: Number(r.gift_count ?? 0),
      gift_coin_total: Number(r.gift_coin_total ?? 0),
      created_at: r.created_at,
    })),
  };
}
