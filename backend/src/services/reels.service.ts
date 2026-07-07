import { supabaseAdmin } from '../lib/supabaseAdmin';
import { applyReelsCdnUrl, getReelPlaybackUrl, withCdnReelUrls } from '../lib/reelUrls';

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export type ReelVisibility = 'public' | 'friends' | 'private' | 'group';

export type ReelRow = {
  id: string;
  author_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  duration: number | null;
  visibility: ReelVisibility;
  group_id: string | null;
  width: number | null;
  height: number | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  hls_url: string | null;
  transcode_status: 'pending' | 'processing' | 'ready' | 'failed' | 'skipped';
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
  moderation_score: number | null;
  sound_id: string | null;
  sound_start_sec: number | null;
  original_audio_volume: number | null;
  sound_volume: number | null;
  scheduled_publish_at: string | null;
  created_at: string;
};

/** Scheduled reels stay hidden from others until publish time; authors always see their own. */
export function isReelSchedulePublished(
  reel: Pick<ReelRow, 'scheduled_publish_at' | 'author_id'>,
  viewerProfileId: string
): boolean {
  if (!reel.scheduled_publish_at) return true;
  if (reel.author_id === viewerProfileId) return true;
  return new Date(reel.scheduled_publish_at).getTime() <= Date.now();
}

export type ReelSoundSummary = {
  id: string;
  title: string;
  artist: string | null;
  audio_url: string;
  preview_url: string | null;
  duration_sec: number | null;
  cover_url: string | null;
  usage_count: number;
};

export type ReelMediaRow = {
  id: string;
  reel_id: string;
  position: number;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  hls_url: string | null;
  transcode_status: 'pending' | 'processing' | 'ready' | 'failed' | 'skipped';
  playback_url?: string;
};

type AuthorProfile = {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type EnrichedReel = ReelRow & {
  author: AuthorProfile | null;
  liked_by_me: boolean;
  playback_url: string;
  media?: ReelMediaRow[];
  sound?: ReelSoundSummary | null;
};

function withCdnMediaRow(row: ReelMediaRow): ReelMediaRow {
  const playback_url = getReelPlaybackUrl({
    video_url: row.media_url,
    hls_url: row.hls_url,
    transcode_status: row.transcode_status,
  });
  return {
    ...row,
    media_url: applyReelsCdnUrl(row.media_url) ?? row.media_url,
    thumbnail_url: applyReelsCdnUrl(row.thumbnail_url) ?? row.thumbnail_url,
    hls_url: applyReelsCdnUrl(row.hls_url) ?? row.hls_url,
    playback_url,
  };
}

/**
 * Returns the set of profile ids that are accepted friends of `profileId`.
 * Includes friendships in both directions (sender + receiver).
 */
export async function getAcceptedFriendIds(profileId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('user_id, friend_id')
    .eq('status', 'accepted')
    .or(`user_id.eq.${profileId},friend_id.eq.${profileId}`);

  if (error) throw new Error(`friendships lookup failed: ${error.message}`);

  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.user_id !== profileId) set.add(row.user_id as string);
    if (row.friend_id !== profileId) set.add(row.friend_id as string);
  }
  return set;
}

/** Whether `viewerProfileId` is allowed to see `reel`. */
export async function canViewReel(
  reel: Pick<
    ReelRow,
    'author_id' | 'visibility' | 'group_id' | 'moderation_status' | 'scheduled_publish_at'
  >,
  viewerProfileId: string,
  friendIds: Set<string>,
  viewerAuthUserId?: string
): Promise<boolean> {
  if (reel.author_id === viewerProfileId) return true;

  if (!isReelSchedulePublished(reel, viewerProfileId)) return false;

  const moderation = reel.moderation_status ?? 'approved';
  if (moderation !== 'approved') return false;

  if (reel.visibility === 'public') return true;
  if (reel.visibility === 'friends') return friendIds.has(reel.author_id);
  if (reel.visibility === 'group' && reel.group_id && viewerAuthUserId) {
    const { data } = await supabaseAdmin
      .from('group_members')
      .select('id')
      .eq('group_id', reel.group_id)
      .eq('user_id', viewerAuthUserId)
      .maybeSingle();
    return Boolean(data);
  }
  return false;
}

export async function filterVisibleReels(
  reels: ReelRow[],
  viewerProfileId: string,
  friendIds: Set<string>,
  viewerAuthUserId: string
): Promise<ReelRow[]> {
  const visible: ReelRow[] = [];
  for (const reel of reels) {
    if (await canViewReel(reel, viewerProfileId, friendIds, viewerAuthUserId)) {
      visible.push(reel);
    }
  }
  return visible;
}

/**
 * Bulk-enrich reels with author profile + my_liked. Caller is responsible for
 * having already filtered for visibility.
 */
export async function enrichReels(
  reels: ReelRow[],
  viewerProfileId: string
): Promise<EnrichedReel[]> {
  if (reels.length === 0) return [];

  const reelIds = reels.map((r) => r.id);
  const authorIds = Array.from(new Set(reels.map((r) => r.author_id)));
  const soundIds = Array.from(
    new Set(reels.map((r) => r.sound_id).filter((id): id is string => Boolean(id)))
  );

  const [authorsRes, likesRes, soundsRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, user_id, display_name, email, avatar_url')
      .in('id', authorIds),
    supabaseAdmin
      .from('reel_likes')
      .select('reel_id')
      .eq('user_id', viewerProfileId)
      .in('reel_id', reelIds),
    soundIds.length
      ? supabaseAdmin
          .from('reel_sounds')
          .select('id, title, artist, audio_url, preview_url, duration_sec, cover_url, usage_count')
          .in('id', soundIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (authorsRes.error) throw new Error(authorsRes.error.message);
  if (likesRes.error) throw new Error(likesRes.error.message);
  if (soundsRes.error) throw new Error(soundsRes.error.message);

  const authorById = new Map<string, AuthorProfile>();
  for (const a of (authorsRes.data ?? []) as AuthorProfile[]) {
    authorById.set(a.id, a);
  }

  const likedSet = new Set((likesRes.data ?? []).map((l) => l.reel_id as string));

  const soundById = new Map<string, ReelSoundSummary>();
  for (const s of (soundsRes.data ?? []) as ReelSoundSummary[]) {
    soundById.set(s.id, s);
  }

  const { data: mediaRows, error: mediaErr } = await supabaseAdmin
    .from('reel_media')
    .select('*')
    .in('reel_id', reelIds)
    .order('position', { ascending: true });

  if (mediaErr) throw new Error(mediaErr.message);

  const mediaByReel = new Map<string, ReelMediaRow[]>();
  for (const row of (mediaRows ?? []) as ReelMediaRow[]) {
    const list = mediaByReel.get(row.reel_id) ?? [];
    list.push(withCdnMediaRow(row));
    mediaByReel.set(row.reel_id, list);
  }

  return reels.map((r) =>
    withCdnReelUrls({
      ...r,
      transcode_status: r.transcode_status ?? 'pending',
      hls_url: r.hls_url ?? null,
      moderation_status: r.moderation_status ?? 'pending',
      moderation_reason: r.moderation_reason ?? null,
      moderation_score: r.moderation_score ?? null,
      author: authorById.get(r.author_id) ?? null,
      liked_by_me: likedSet.has(r.id),
      media: mediaByReel.get(r.id),
      sound: r.sound_id ? soundById.get(r.sound_id) ?? null : null,
    })
  );
}

/**
 * Server-side visibility filter applied via Postgres OR.
 * Used in feed query so we don't pull private reels we'd then drop.
 */
export function visibilityFilterClause(profileId: string, friendIds: string[]): string {
  const parts = [`visibility.eq.public`, `author_id.eq.${profileId}`];
  if (friendIds.length > 0) {
    parts.push(`and(visibility.eq.friends,author_id.in.(${friendIds.join(',')}))`);
  }
  return parts.join(',');
}

/**
 * TikTok-style lightweight ranking:
 * - strong boost for creators the viewer interacts with (likes > views)
 * - recency decay (fresh content)
 * - engagement quality (likes/comments weighted over views)
 * - slight diversity boost for unseen creators (exploration)
 */
export async function rankReelsForViewer(
  reels: ReelRow[],
  viewerProfileId: string
): Promise<ReelRow[]> {
  if (reels.length <= 1) return reels;

  const reelIds = reels.map((r) => r.id);

  const [myLikesRes, myViewsRes] = await Promise.all([
    supabaseAdmin
      .from('reel_likes')
      .select('reel_id')
      .eq('user_id', viewerProfileId)
      .in('reel_id', reelIds),
    supabaseAdmin
      .from('reel_views')
      .select('reel_id')
      .eq('user_id', viewerProfileId)
      .in('reel_id', reelIds),
  ]);

  const likedSet = new Set((myLikesRes.data ?? []).map((r) => r.reel_id as string));
  const viewedSet = new Set((myViewsRes.data ?? []).map((r) => r.reel_id as string));

  // Build author affinity from recent interaction history (not limited to this page).
  const [likedHistoryRes, viewedHistoryRes] = await Promise.all([
    supabaseAdmin
      .from('reel_likes')
      .select('reel_id, reels!inner(author_id, created_at)')
      .eq('user_id', viewerProfileId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('reel_views')
      .select('reel_id, reels!inner(author_id, created_at)')
      .eq('user_id', viewerProfileId)
      .order('created_at', { ascending: false })
      .limit(400),
  ]);

  const affinity = new Map<string, number>();
  const addAffinity = (authorId: string, delta: number) => {
    affinity.set(authorId, (affinity.get(authorId) ?? 0) + delta);
  };

  for (const row of likedHistoryRes.data ?? []) {
    const reelsJoin = (row as { reels?: { author_id?: string } | { author_id?: string }[] }).reels;
    const reel = Array.isArray(reelsJoin) ? reelsJoin[0] : reelsJoin;
    if (reel?.author_id) addAffinity(reel.author_id, 2.4);
  }
  for (const row of viewedHistoryRes.data ?? []) {
    const reelsJoin = (row as { reels?: { author_id?: string } | { author_id?: string }[] }).reels;
    const reel = Array.isArray(reelsJoin) ? reelsJoin[0] : reelsJoin;
    if (reel?.author_id) addAffinity(reel.author_id, 0.65);
  }

  const now = Date.now();
  const scored = reels.map((r) => {
    const ageHours = Math.max(0, (now - new Date(r.created_at).getTime()) / 3_600_000);
    const recency = Math.exp(-ageHours / 28); // half-life-ish around ~19h

    const engagementRate =
      (r.like_count * 1.4 + r.comment_count * 1.8 + r.view_count * 0.15) /
      Math.max(8, r.view_count);

    const authorAffinity = affinity.get(r.author_id) ?? 0;
    const unseenBonus = viewedSet.has(r.id) ? -0.25 : 0.55;
    const likedPenalty = likedSet.has(r.id) ? -0.45 : 0;
    const smallRandom = Math.random() * 0.12;

    const score =
      recency * 2.4 +
      Math.min(2.2, engagementRate * 2) +
      Math.min(4.5, authorAffinity) +
      unseenBonus +
      likedPenalty +
      smallRandom;

    return { reel: r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.reel);
}
