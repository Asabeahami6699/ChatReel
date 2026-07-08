import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  asyncHandler,
  AuthedRequest,
  getProfileIdByUserId,
  requireAuth,
} from '../middleware/auth';
import {
  canViewReel,
  filterVisibleReels,
  enrichReels,
  getAcceptedFriendIds,
  ReelRow,
  ReelVisibility,
} from '../services/reels.service';
import { sendPushToUserSafe, getAuthUserIdByProfileId } from '../services/push.service';
import { isReelHlsEnabled, queueReelHlsTranscode, queueReelSoundMux } from '../services/reelTranscode.service';
import { assertCaptionAllowed, scheduleReelModeration } from '../services/reelModeration.service';
import { assertReelSoundActive, createReelSound, deactivateReelSoundForUser, getReelSoundById, listReelSounds } from '../services/reelSounds.service';
import { extractSoundFromVideoUrl } from '../services/reelSoundExtract.service';
import { resolveSoundFromReel } from '../services/reelSoundFromReel.service';
import { buildWatermarkedReelDownload } from '../services/reelDownload.service';
import { probeVideoDimensionsFromUrl } from '../lib/videoProbe';

const router = Router();

async function enrichCommentLikes<T extends { id: string }>(
  comments: T[],
  profileId: string
): Promise<Array<T & { like_count?: number; liked_by_me?: boolean }>> {
  if (!comments.length) return comments;
  const ids = comments.map((c) => c.id);
  const { data: likes } = await supabaseAdmin
    .from('reel_comment_likes')
    .select('comment_id')
    .eq('user_id', profileId)
    .in('comment_id', ids);
  const likedSet = new Set((likes ?? []).map((l) => l.comment_id as string));
  return comments.map((c) => ({
    ...c,
    liked_by_me: likedSet.has(c.id),
    like_count: (c as { like_count?: number }).like_count ?? 0,
  }));
}

const VISIBILITIES: ReelVisibility[] = ['public', 'friends', 'private', 'group'];

const createReelSchema = z.object({
  video_url: z.string().url().min(1).optional(),
  thumbnail_url: z.string().url().optional(),
  caption: z.string().max(2000).optional(),
  // Some pickers/cameras report 0 or omit duration. Treat sub-0.5s as unknown
  // instead of rejecting the whole publish request.
  duration: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n) || n < 0.5) return undefined;
      return n;
    }, z.number().max(180).optional()),
  visibility: z.enum(['public', 'friends', 'private', 'group']).default('public'),
  group_id: z.string().uuid().optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  trim_start_sec: z.number().min(0).optional(),
  trim_end_sec: z.number().min(0).optional(),
  sound_id: z.string().uuid().optional(),
  sound_start_sec: z.number().min(0).optional(),
  original_audio_volume: z.number().min(0).max(1).optional(),
  sound_volume: z.number().min(0).max(1).optional(),
  scheduled_publish_at: z.string().min(1).optional(),
  media: z
    .array(
      z.object({
        media_url: z.string().url().min(1),
        media_type: z.enum(['image', 'video']),
        thumbnail_url: z.string().url().optional(),
        duration: z
          .preprocess((value) => {
            if (value === undefined || value === null || value === '') return undefined;
            const n = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(n) || n < 0.5) return undefined;
            return n;
          }, z.number().max(180).optional()),
        width: z.number().int().min(1).optional(),
        height: z.number().int().min(1).optional(),
        trim_start_sec: z.number().min(0).optional(),
        trim_end_sec: z.number().min(0).optional(),
      })
    )
    .min(1)
    .max(10)
    .optional(),
}).refine((body) => Boolean(body.video_url || (body.media && body.media.length > 0)), {
  message: 'video_url or media is required',
});

/** Reject video URLs that don't come from our reels storage bucket. */
function assertReelsBucketUrl(url: string): void {
  // Supabase public URL shape:
  //   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const match = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\//.exec(url);
  if (!match || match[1] !== 'reels') {
    throw new Error('video_url must point to the reels bucket');
  }
}

/* -------------------------------------------------------------------------- */
/*  GET /feed — paginated, visibility-filtered reels                          */
/* -------------------------------------------------------------------------- */
router.get(
  '/feed',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const limit = Math.min(Number(req.query.limit ?? 10), 30);
    const cursor = req.query.cursor as string | undefined; // ISO created_at

    const friendSet = await getAcceptedFriendIds(profileId);
    const friendIds = Array.from(friendSet);

    const { fetchCandidateReels, fetchFreshReelsForFeed, recommendReelsForUser } = await import(
      '../services/reelRecommendation.service'
    );

    const candidates = await fetchCandidateReels({
      profileId,
      friendIds,
      viewerAuthUserId: req.userId!,
      cursor,
      targetCount: 120,
    });

    const ranked = await recommendReelsForUser(profileId, candidates, {
      limit: Math.min(limit * 2, 30),
    });

    let page = ranked.slice(0, limit);

    // First page: prepend newest approved reels so uploads appear quickly in For You.
    if (!cursor) {
      const fresh = await fetchFreshReelsForFeed({
        profileId,
        friendIds,
        viewerAuthUserId: req.userId!,
        limit: 5,
        maxAgeHours: 72,
      });
      const onPage = new Set(page.map((r) => r.id));
      const inject = fresh.filter((r) => !onPage.has(r.id));
      page = [...inject, ...page].slice(0, limit);
    }

    const enriched = await enrichReels(page, profileId);
    const nextCursor = ranked.length > limit ? ranked[limit - 1].created_at : null;

    return res.json({ reels: enriched, next_cursor: nextCursor });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /feed/following — reels from accepted friends (chronological)         */
/* -------------------------------------------------------------------------- */
router.get(
  '/feed/following',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const limit = Math.min(Number(req.query.limit ?? 10), 30);
    const fetchLimit = Math.min(Math.max(limit * 4, 40), 120);
    const cursor = req.query.cursor as string | undefined;

    const friendSet = await getAcceptedFriendIds(profileId);
    const authorIds = Array.from(friendSet);
    authorIds.push(profileId);

    if (authorIds.length === 0) {
      return res.json({ reels: [], next_cursor: null });
    }

    let query = supabaseAdmin
      .from('reels')
      .select('*')
      .eq('moderation_status', 'approved')
      .in('author_id', authorIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(fetchLimit);

    if (cursor) query = query.lt('created_at', cursor);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const visible = await filterVisibleReels(
      (data ?? []) as ReelRow[],
      profileId,
      friendSet,
      req.userId!
    );
    const page = visible.slice(0, limit);
    const enriched = await enrichReels(page, profileId);
    const nextCursor = visible.length > limit ? visible[limit - 1].created_at : null;

    return res.json({ reels: enriched, next_cursor: nextCursor });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /me — my reels                                                        */
/* -------------------------------------------------------------------------- */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const limit = Math.min(Number(req.query.limit ?? 30), 50);

    const { data, error } = await supabaseAdmin
      .from('reels')
      .select('*')
      .eq('author_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    const enriched = await enrichReels((data ?? []) as ReelRow[], profileId);
    return res.json({ reels: enriched });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /inbox — likes & comments on the viewer's reels                       */
/* -------------------------------------------------------------------------- */
router.get(
  '/inbox',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const limit = Math.min(Number(req.query.limit ?? 40), 60);

    const { data: myReels, error: reelsErr } = await supabaseAdmin
      .from('reels')
      .select('id')
      .eq('author_id', profileId);

    if (reelsErr) return res.status(500).json({ error: reelsErr.message });

    const reelIds = (myReels ?? []).map((r) => r.id as string);
    if (reelIds.length === 0) return res.json({ items: [] });

    const perType = Math.min(limit, 30);

    const [likesRes, commentsRes] = await Promise.all([
      supabaseAdmin
        .from('reel_likes')
        .select(
          `id, created_at, reel_id,
           actor:profiles!reel_likes_user_id_fkey(id, display_name, email, avatar_url),
           reel:reels!inner(id, thumbnail_url, caption, video_url, author_id)`
        )
        .in('reel_id', reelIds)
        .neq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(perType),
      supabaseAdmin
        .from('reel_comments')
        .select(
          `id, created_at, reel_id, content,
           actor:profiles!reel_comments_user_id_fkey(id, display_name, email, avatar_url),
           reel:reels!inner(id, thumbnail_url, caption, video_url, author_id)`
        )
        .in('reel_id', reelIds)
        .neq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(perType),
    ]);

    if (likesRes.error) return res.status(500).json({ error: likesRes.error.message });
    if (commentsRes.error) return res.status(500).json({ error: commentsRes.error.message });

    type InboxRow = {
      id: string;
      type: 'like' | 'comment';
      created_at: string;
      actor: Record<string, unknown> | null;
      reel: Record<string, unknown> | null;
      comment?: { id: string; content: string };
    };

    const items: InboxRow[] = [];

    for (const row of likesRes.data ?? []) {
      items.push({
        id: `like-${row.id}`,
        type: 'like',
        created_at: row.created_at as string,
        actor: row.actor as unknown as Record<string, unknown> | null,
        reel: row.reel as unknown as Record<string, unknown> | null,
      });
    }

    for (const row of commentsRes.data ?? []) {
      items.push({
        id: `comment-${row.id}`,
        type: 'comment',
        created_at: row.created_at as string,
        actor: row.actor as unknown as Record<string, unknown> | null,
        reel: row.reel as unknown as Record<string, unknown> | null,
        comment: { id: row.id as string, content: row.content as string },
      });
    }

    items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return res.json({ items: items.slice(0, limit) });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /search — reels by caption + creator profiles                         */
/* -------------------------------------------------------------------------- */
router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = String(req.query.q ?? '').trim();
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });
    if (!q) return res.json({ reels: [], profiles: [] });

    const friendSet = await getAcceptedFriendIds(profileId);
    const friendIds = Array.from(friendSet);
    const escaped = q.replace(/[%_]/g, '\\$&');
    const captionFilter = `caption.ilike.%${escaped}%,caption.ilike.${escaped}%`;

    const [reelsRes, profilesRes] = await Promise.all([
      supabaseAdmin
        .from('reels')
        .select('*')
        .or(captionFilter)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('profiles')
        .select('id, user_id, display_name, email, avatar_url')
        .or(`display_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
        .neq('id', profileId)
        .limit(12),
    ]);

    if (reelsRes.error) return res.status(500).json({ error: reelsRes.error.message });
    if (profilesRes.error) return res.status(500).json({ error: profilesRes.error.message });

    const profileIds = (profilesRes.data ?? []).map((p) => p.id as string);
    let authorReels: ReelRow[] = [];
    if (profileIds.length) {
      const { data: byAuthor, error: authorErr } = await supabaseAdmin
        .from('reels')
        .select('*')
        .in('author_id', profileIds)
        .order('created_at', { ascending: false })
        .limit(20);
      if (authorErr) return res.status(500).json({ error: authorErr.message });
      authorReels = (byAuthor ?? []) as ReelRow[];
    }

    const mergedById = new Map<string, ReelRow>();
    for (const row of [...((reelsRes.data ?? []) as ReelRow[]), ...authorReels]) {
      mergedById.set(row.id, row);
    }
    const visible = await filterVisibleReels(
      Array.from(mergedById.values()),
      profileId,
      friendSet,
      req.userId!
    );
    const enriched = await enrichReels(visible, profileId);

    return res.json({
      reels: enriched,
      profiles: profilesRes.data ?? [],
    });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /user/:profileId — reels by a specific author (visibility-filtered)   */
/* -------------------------------------------------------------------------- */
router.get(
  '/user/:profileId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const targetId = z.string().uuid().parse(req.params.profileId);
    const viewerProfileId = await getProfileIdByUserId(req.userId!);
    if (!viewerProfileId) return res.status(404).json({ error: 'Profile not found' });

    const friendSet = await getAcceptedFriendIds(viewerProfileId);
    const limit = Math.min(Number(req.query.limit ?? 30), 50);

    const { data, error } = await supabaseAdmin
      .from('reels')
      .select('*')
      .eq('author_id', targetId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });

    const visible = await filterVisibleReels(
      (data ?? []) as ReelRow[],
      viewerProfileId,
      friendSet,
      req.userId!
    );
    const enriched = await enrichReels(visible, viewerProfileId);
    return res.json({ reels: enriched });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /sounds — browse / search sound library                               */
/* -------------------------------------------------------------------------- */
router.get(
  '/sounds',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const trending = req.query.trending === '1' || req.query.trending === 'true';
    const newest = req.query.new === '1' || req.query.new === 'true';
    const licensed = req.query.licensed === '1' || req.query.licensed === 'true';
    const genre = typeof req.query.genre === 'string' ? req.query.genre : undefined;
    const mood = typeof req.query.mood === 'string' ? req.query.mood : undefined;
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    const limit = Math.min(Number(req.query.limit ?? 30), 50);

    let sounds;
    if (mine) {
      const profileId = await getProfileIdByUserId(req.userId!);
      if (!profileId) {
        return res.json({ sounds: [] });
      }
      sounds = await listReelSounds({ q, limit, uploadedByProfileId: profileId });
    } else {
      sounds = await listReelSounds({
        q,
        trending: trending && !newest && !genre && !mood && !licensed,
        newest,
        licensedOnly: licensed,
        genre,
        mood,
        limit,
      });
    }
    return res.json({ sounds });
  })
);

const createSoundSchema = z.object({
  audio_url: z.string().url().min(1),
  title: z.string().min(1).max(120),
  artist: z.string().max(120).optional(),
  duration_sec: z.number().min(0).optional(),
});

/* -------------------------------------------------------------------------- */
/*  POST /sounds — upload custom audio to the library                           */
/* -------------------------------------------------------------------------- */
router.post(
  '/sounds',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createSoundSchema.parse(req.body);
    try {
      assertReelsBucketUrl(body.audio_url);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, email')
      .eq('id', profileId)
      .maybeSingle();

    const artist =
      body.artist?.trim() ||
      profile?.display_name?.trim() ||
      profile?.email?.split('@')[0] ||
      'You';

    const sound = await createReelSound({
      title: body.title,
      artist,
      audio_url: body.audio_url,
      duration_sec: body.duration_sec,
      uploaded_by: profileId,
    });

    return res.status(201).json({ sound });
  })
);

const fromReelSoundSchema = z.object({
  reel_id: z.string().uuid(),
});

/* -------------------------------------------------------------------------- */
/*  POST /sounds/from-reel — reuse library or extract original audio from reel  */
/* -------------------------------------------------------------------------- */
router.post(
  '/sounds/from-reel',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = fromReelSoundSchema.parse(req.body);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const sound = await resolveSoundFromReel({
      reelId: body.reel_id,
      requesterProfileId: profileId,
      requesterAuthUserId: req.userId!,
    });

    return res.status(201).json({ sound });
  })
);

const extractSoundSchema = z.object({
  video_url: z.string().url().min(1),
  title: z.string().min(1).max(120).optional(),
  duration_sec: z.number().min(0).optional(),
});

/* -------------------------------------------------------------------------- */
/*  POST /sounds/extract — extract audio from a reels-bucket video              */
/* -------------------------------------------------------------------------- */
router.post(
  '/sounds/extract',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = extractSoundSchema.parse(req.body);
    try {
      assertReelsBucketUrl(body.video_url);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, email')
      .eq('id', profileId)
      .maybeSingle();

    const artist =
      profile?.display_name?.trim() ||
      profile?.email?.split('@')[0] ||
      'You';

    const sound = await extractSoundFromVideoUrl({
      videoUrl: body.video_url,
      profileId,
      title: body.title?.trim() || 'Extracted audio',
      artist,
      durationSec: body.duration_sec,
    });

    return res.status(201).json({ sound });
  })
);

/* -------------------------------------------------------------------------- */
/*  DELETE /sounds/:soundId — remove your uploaded sound                        */
/* -------------------------------------------------------------------------- */
router.delete(
  '/sounds/:soundId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const soundId = z.string().uuid().parse(req.params.soundId);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    await deactivateReelSoundForUser(soundId, profileId);
    return res.json({ ok: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /sounds/:soundId — sound detail                                       */
/* -------------------------------------------------------------------------- */
router.get(
  '/sounds/:soundId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const soundId = z.string().uuid().parse(req.params.soundId);
    const sound = await getReelSoundById(soundId);
    if (!sound) return res.status(404).json({ error: 'Sound not found' });
    return res.json({ sound });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /sounds/:soundId/reels — reels using this sound                       */
/* -------------------------------------------------------------------------- */
router.get(
  '/sounds/:soundId/reels',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const soundId = z.string().uuid().parse(req.params.soundId);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const sound = await getReelSoundById(soundId);
    if (!sound) return res.status(404).json({ error: 'Sound not found' });

    const limit = Math.min(Number(req.query.limit ?? 20), 30);
    const cursor = req.query.cursor as string | undefined;
    const friendSet = await getAcceptedFriendIds(profileId);

    let query = supabaseAdmin
      .from('reels')
      .select('*')
      .eq('sound_id', soundId)
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt('created_at', cursor);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const visible = await filterVisibleReels(
      (data ?? []) as ReelRow[],
      profileId,
      friendSet,
      req.userId!
    );
    const page = visible.slice(0, limit);
    const enriched = await enrichReels(page, profileId);
    const nextCursor = visible.length > limit ? visible[limit - 1].created_at : null;

    return res.json({ sound, reels: enriched, next_cursor: nextCursor });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST/DELETE /comments/:commentId/like — must be before /:id routes        */
/* -------------------------------------------------------------------------- */
router.post(
  '/comments/:commentId/like',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const commentId = z.string().uuid().parse(req.params.commentId);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: comment } = await supabaseAdmin
      .from('reel_comments')
      .select('id, reel_id')
      .eq('id', commentId)
      .maybeSingle();
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const { data: reel } = await supabaseAdmin
      .from('reels')
      .select('id, author_id, visibility, scheduled_publish_at, moderation_status')
      .eq('id', comment.reel_id)
      .maybeSingle();
    if (!reel) return res.status(404).json({ error: 'Reel not found' });
    const friendSet = await getAcceptedFriendIds(profileId);
    if (!(await canViewReel(reel as ReelRow, profileId, friendSet, req.userId!))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const { error } = await supabaseAdmin
      .from('reel_comment_likes')
      .upsert({ comment_id: commentId, user_id: profileId }, { onConflict: 'comment_id,user_id' });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.delete(
  '/comments/:commentId/like',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const commentId = z.string().uuid().parse(req.params.commentId);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { error } = await supabaseAdmin
      .from('reel_comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', profileId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /:id/download — watermarked MP4 for saving/sharing                      */
/* -------------------------------------------------------------------------- */
router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const viewerProfileId = await getProfileIdByUserId(req.userId!);
    if (!viewerProfileId) return res.status(404).json({ error: 'Profile not found' });

    const { data, error } = await supabaseAdmin
      .from('reels')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Reel not found' });

    const friendSet = await getAcceptedFriendIds(viewerProfileId);
    if (!(await canViewReel(data as ReelRow, viewerProfileId, friendSet, req.userId!))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const { data: author } = await supabaseAdmin
      .from('profiles')
      .select('display_name, email')
      .eq('id', data.author_id)
      .maybeSingle();

    const { publicUrl } = await buildWatermarkedReelDownload(data as ReelRow, author);
    return res.json({ download_url: publicUrl });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /:id — single reel                                                    */
/* -------------------------------------------------------------------------- */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const viewerProfileId = await getProfileIdByUserId(req.userId!);
    if (!viewerProfileId) return res.status(404).json({ error: 'Profile not found' });

    const { data, error } = await supabaseAdmin
      .from('reels')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Reel not found' });

    const friendSet = await getAcceptedFriendIds(viewerProfileId);
    if (!(await canViewReel(data as ReelRow, viewerProfileId, friendSet, req.userId!))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const [enriched] = await enrichReels([data as ReelRow], viewerProfileId);
    return res.json({ reel: enriched });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST / — create reel                                                      */
/* -------------------------------------------------------------------------- */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createReelSchema.parse(req.body);
    const mediaItems = body.media ?? [];
    const primary =
      mediaItems[0] ??
      ({
        media_url: body.video_url!,
        media_type: 'video' as const,
        thumbnail_url: body.thumbnail_url,
        duration: body.duration,
        width: body.width,
        height: body.height,
      });

    try {
      assertReelsBucketUrl(primary.media_url);
      for (const item of mediaItems) {
        assertReelsBucketUrl(item.media_url);
        if (item.thumbnail_url) assertReelsBucketUrl(item.thumbnail_url);
      }
      if (body.thumbnail_url) assertReelsBucketUrl(body.thumbnail_url);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    try {
      await assertCaptionAllowed(body.caption);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    if (body.visibility === 'group') {
      if (!body.group_id) {
        return res.status(400).json({ error: 'group_id is required for group visibility' });
      }
      const { data: member } = await supabaseAdmin
        .from('group_members')
        .select('id')
        .eq('group_id', body.group_id)
        .eq('user_id', req.userId!)
        .maybeSingle();
      if (!member) return res.status(403).json({ error: 'Not a member of this group' });
    }

    if (body.sound_id) {
      if (mediaItems.length > 1) {
        return res.status(400).json({ error: 'Sounds are only supported on single-media reels' });
      }
      try {
        await assertReelSoundActive(body.sound_id);
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
    }

    let width = primary.width ?? body.width ?? null;
    let height = primary.height ?? body.height ?? null;
    if ((!width || !height) && primary.media_type === 'video') {
      try {
        const dims = await probeVideoDimensionsFromUrl(primary.media_url);
        width = width ?? dims.width;
        height = height ?? dims.height;
      } catch {
        // Dimensions may be filled during HLS transcode.
      }
    }

    const thumbnailUrl =
      primary.thumbnail_url ??
      body.thumbnail_url ??
      (primary.media_type === 'image' ? primary.media_url : null);

    const { data, error } = await supabaseAdmin
      .from('reels')
      .insert({
        author_id: profileId,
        video_url: primary.media_url,
        thumbnail_url: thumbnailUrl,
        caption: body.caption ?? null,
        duration: primary.duration ?? body.duration ?? null,
        visibility: body.visibility,
        group_id: body.visibility === 'group' ? body.group_id ?? null : null,
        width,
        height,
        sound_id: body.sound_id ?? null,
        sound_start_sec: body.sound_start_sec ?? 0,
        original_audio_volume:
          body.original_audio_volume ?? (body.sound_id ? 0 : 1),
        sound_volume: body.sound_volume ?? (body.sound_id ? 0.45 : 1),
        scheduled_publish_at: body.scheduled_publish_at ?? null,
        transcode_status: primary.media_type === 'image' ? 'skipped' : 'pending',
        moderation_status: 'pending',
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const reelId = data.id as string;

    if (mediaItems.length > 0) {
      const rows = mediaItems.map((item, index) => ({
        reel_id: reelId,
        position: index,
        media_url: item.media_url,
        media_type: item.media_type,
        thumbnail_url:
          item.thumbnail_url ?? (item.media_type === 'image' ? item.media_url : null),
        duration: item.duration ?? null,
        width: item.width ?? null,
        height: item.height ?? null,
        transcode_status: item.media_type === 'image' ? 'skipped' : 'pending',
      }));
      const { error: mediaErr } = await supabaseAdmin.from('reel_media').insert(rows);
      if (mediaErr) {
        await supabaseAdmin.from('reels').delete().eq('id', reelId);
        return res.status(500).json({ error: mediaErr.message });
      }

      for (const item of mediaItems) {
        if (item.media_type !== 'video') continue;
        if (mediaItems.length === 1) {
          if (body.sound_id && !isReelHlsEnabled()) {
            queueReelSoundMux(reelId, item.media_url, {
              trimStartSec: item.trim_start_sec,
              trimEndSec: item.trim_end_sec,
            });
          } else if (isReelHlsEnabled()) {
            queueReelHlsTranscode(reelId, item.media_url, {
              trimStartSec: item.trim_start_sec,
              trimEndSec: item.trim_end_sec,
            });
          } else {
            await supabaseAdmin.from('reels').update({ transcode_status: 'skipped' }).eq('id', reelId);
          }
        }
      }
    } else if (primary.media_type === 'video') {
      if (body.sound_id && !isReelHlsEnabled()) {
        queueReelSoundMux(reelId, primary.media_url, {
          trimStartSec: body.trim_start_sec,
          trimEndSec: body.trim_end_sec,
        });
      } else if (isReelHlsEnabled()) {
        queueReelHlsTranscode(reelId, primary.media_url, {
          trimStartSec: body.trim_start_sec,
          trimEndSec: body.trim_end_sec,
        });
      } else {
        await supabaseAdmin.from('reels').update({ transcode_status: 'skipped' }).eq('id', reelId);
      }
    }

    const usesTranscodeModeration =
      primary.media_type === 'video' &&
      isReelHlsEnabled() &&
      mediaItems.length <= 1;
    if (!usesTranscodeModeration) {
      scheduleReelModeration(reelId);
    }

    const [enriched] = await enrichReels([data as ReelRow], profileId);
    return res.status(201).json({ reel: enriched });
  })
);

/* -------------------------------------------------------------------------- */
/*  DELETE /:id — author only                                                 */
/* -------------------------------------------------------------------------- */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: existing, error: getErr } = await supabaseAdmin
      .from('reels')
      .select('id, author_id, video_url, thumbnail_url')
      .eq('id', id)
      .maybeSingle();

    if (getErr) return res.status(500).json({ error: getErr.message });
    if (!existing) return res.status(404).json({ error: 'Reel not found' });
    if (existing.author_id !== profileId) {
      return res.status(403).json({ error: 'Only the author can delete' });
    }

    const { error } = await supabaseAdmin.from('reels').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    // best-effort storage cleanup (don't fail the request)
    try {
      const paths: string[] = [];
      const extract = (url?: string | null) => {
        if (!url) return;
        const m = /\/storage\/v1\/object\/(?:public|sign)\/reels\/(.+?)(?:\?|$)/.exec(url);
        if (m?.[1]) paths.push(m[1]);
      };
      extract(existing.video_url as string);
      extract(existing.thumbnail_url as string | null);
      if (paths.length > 0) {
        await supabaseAdmin.storage.from('reels').remove(paths);
      }
      const { data: hlsFiles } = await supabaseAdmin.storage.from('reels').list(`hls/${id}`);
      if (hlsFiles?.length) {
        await supabaseAdmin.storage
          .from('reels')
          .remove(hlsFiles.map((f) => `hls/${id}/${f.name}`));
      }
    } catch (e) {
      console.warn('[reels] storage cleanup failed:', (e as Error).message);
    }

    return res.json({ success: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /:id/like  —  DELETE /:id/like                                       */
/* -------------------------------------------------------------------------- */
router.post(
  '/:id/like',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const reelId = z.string().uuid().parse(req.params.id);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: reel, error: getErr } = await supabaseAdmin
      .from('reels')
      .select('id, author_id, visibility')
      .eq('id', reelId)
      .maybeSingle();

    if (getErr) return res.status(500).json({ error: getErr.message });
    if (!reel) return res.status(404).json({ error: 'Reel not found' });

    const friendSet = await getAcceptedFriendIds(profileId);
    if (!(await canViewReel(reel as ReelRow, profileId, friendSet, req.userId!))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const { error } = await supabaseAdmin
      .from('reel_likes')
      .insert({ reel_id: reelId, user_id: profileId });

    // unique violation = already liked → idempotent OK
    if (error && !/duplicate key|unique constraint/i.test(error.message)) {
      return res.status(500).json({ error: error.message });
    }

    // Notify author (best effort) — only if liker isn't the author
    if (reel.author_id !== profileId) {
      const authUserId = await getAuthUserIdByProfileId(reel.author_id as string);
      const { data: liker } = await supabaseAdmin
        .from('profiles')
        .select('display_name, email')
        .eq('id', profileId)
        .maybeSingle();
      const likerName =
        liker?.display_name || liker?.email?.split('@')[0] || 'Someone';
      if (authUserId) {
        sendPushToUserSafe(authUserId, {
          title: 'New like',
          body: `${likerName} liked your reel`,
          data: { type: 'reel_like', reel_id: reelId },
        });
      }
    }

    return res.json({ success: true });
  })
);

router.delete(
  '/:id/like',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const reelId = z.string().uuid().parse(req.params.id);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { error } = await supabaseAdmin
      .from('reel_likes')
      .delete()
      .eq('reel_id', reelId)
      .eq('user_id', profileId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  POST /:id/view — idempotent per-user view tracking                        */
/* -------------------------------------------------------------------------- */
router.post(
  '/:id/view',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const reelId = z.string().uuid().parse(req.params.id);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { error } = await supabaseAdmin
      .from('reel_views')
      .insert({ reel_id: reelId, user_id: profileId });

    if (error && !/duplicate key|unique constraint/i.test(error.message)) {
      return res.status(500).json({ error: error.message });
    }

    void import('../services/reelRecommendation.service').then(({ recordEngagementEvent }) =>
      recordEngagementEvent({
        profileId,
        reelId,
        eventType: 'view',
        completionRate: Number(req.body?.completion_rate) || undefined,
        watchMs: Number(req.body?.watch_ms) || undefined,
      })
    );

    return res.json({ success: true });
  })
);

/* -------------------------------------------------------------------------- */
/*  GET /:id/comments  —  POST /:id/comments  —  DELETE /comments/:cid        */
/* -------------------------------------------------------------------------- */
router.get(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const reelId = z.string().uuid().parse(req.params.id);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    // Visibility check
    const { data: reel } = await supabaseAdmin
      .from('reels')
      .select('id, author_id, visibility')
      .eq('id', reelId)
      .maybeSingle();
    if (!reel) return res.status(404).json({ error: 'Reel not found' });
    const friendSet = await getAcceptedFriendIds(profileId);
    if (!(await canViewReel(reel as ReelRow, profileId, friendSet, req.userId!))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const limit = Math.min(Number(req.query.limit ?? 30), 100);
    const cursor = req.query.cursor as string | undefined;

    const selectCols =
      `id, reel_id, user_id, parent_id, content, like_count, created_at,
       author:profiles!reel_comments_user_id_fkey(id, user_id, display_name, email, avatar_url)`;

    let parentQuery = supabaseAdmin
      .from('reel_comments')
      .select(selectCols)
      .eq('reel_id', reelId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) parentQuery = parentQuery.lt('created_at', cursor);

    const { data: parents, error: parentErr } = await parentQuery;
    if (parentErr) {
      if (parentErr.message.includes('parent_id')) {
        let fallback = supabaseAdmin
          .from('reel_comments')
          .select(selectCols.replace('parent_id, ', ''))
          .eq('reel_id', reelId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (cursor) fallback = fallback.lt('created_at', cursor);
        const { data, error } = await fallback;
        if (error) return res.status(500).json({ error: error.message });
        const rows = (data ?? []) as unknown as Array<{ id: string; created_at: string }>;
        const next_cursor =
          rows.length === limit ? rows[rows.length - 1].created_at : null;
        const enriched = await enrichCommentLikes(rows, profileId);
        return res.json({ comments: enriched, next_cursor });
      }
      return res.status(500).json({ error: parentErr.message });
    }

    const parentIds = (parents ?? []).map((p) => p.id as string);
    let replies: typeof parents = [];
    if (parentIds.length) {
      const { data: replyRows, error: replyErr } = await supabaseAdmin
        .from('reel_comments')
        .select(selectCols)
        .eq('reel_id', reelId)
        .in('parent_id', parentIds)
        .order('created_at', { ascending: true });
      if (replyErr && !replyErr.message.includes('parent_id')) {
        return res.status(500).json({ error: replyErr.message });
      }
      replies = replyRows ?? [];
    }

    const comments = [...(parents ?? []), ...replies];
    const next_cursor =
      parents && parents.length === limit
        ? (parents[parents.length - 1].created_at as string)
        : null;
    const enriched = await enrichCommentLikes(
      comments as Array<{ id: string }>,
      profileId
    );
    return res.json({ comments: enriched, next_cursor });
  })
);

router.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const reelId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        content: z.string().min(1).max(1000),
        parent_id: z.string().uuid().optional(),
      })
      .parse(req.body);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: reel } = await supabaseAdmin
      .from('reels')
      .select('id, author_id, visibility')
      .eq('id', reelId)
      .maybeSingle();
    if (!reel) return res.status(404).json({ error: 'Reel not found' });
    const friendSet = await getAcceptedFriendIds(profileId);
    if (!(await canViewReel(reel as ReelRow, profileId, friendSet, req.userId!))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (body.parent_id) {
      const { data: parent } = await supabaseAdmin
        .from('reel_comments')
        .select('id, reel_id')
        .eq('id', body.parent_id)
        .maybeSingle();
      if (!parent || parent.reel_id !== reelId) {
        return res.status(400).json({ error: 'Invalid reply target' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('reel_comments')
      .insert({
        reel_id: reelId,
        user_id: profileId,
        content: body.content,
        parent_id: body.parent_id ?? null,
      })
      .select(
        `id, reel_id, user_id, parent_id, content, like_count, created_at,
         author:profiles!reel_comments_user_id_fkey(id, user_id, display_name, email, avatar_url)`
      )
      .single();

    if (error) {
      if (error.message.includes('parent_id') && body.parent_id) {
        return res.status(503).json({
          error:
            'Comment replies are not enabled on the database yet. Apply migration 020_reel_comment_replies.sql.',
        });
      }
      return res.status(500).json({ error: error.message });
    }

    const [comment] = await enrichCommentLikes([data as { id: string }], profileId);

    if (reel.author_id !== profileId) {
      const authUserId = await getAuthUserIdByProfileId(reel.author_id as string);
      if (authUserId) {
        const author = (comment as { author?: { display_name?: string; email?: string } }).author;
        const name = author?.display_name || author?.email?.split('@')[0] || 'Someone';
        sendPushToUserSafe(authUserId, {
          title: 'New comment',
          body: `${name}: ${body.content.slice(0, 80)}`,
          data: { type: 'reel_comment', reel_id: reelId, comment_id: comment.id },
        });
      }
    }

    return res.status(201).json({ comment });
  })
);

router.delete(
  '/comments/:commentId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const commentId = z.string().uuid().parse(req.params.commentId);
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: comment } = await supabaseAdmin
      .from('reel_comments')
      .select('id, user_id, reel_id, reels(author_id)')
      .eq('id', commentId)
      .maybeSingle();

    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    // Supabase types FK joins as either object or array depending on shape;
    // normalise to a single record before reading author_id.
    const reelsJoin = comment.reels as
      | { author_id: string }
      | { author_id: string }[]
      | null
      | undefined;
    const reel = Array.isArray(reelsJoin) ? reelsJoin[0] ?? null : reelsJoin ?? null;
    const isAuthorOfReel = reel?.author_id === profileId;
    const isAuthorOfComment = comment.user_id === profileId;
    if (!isAuthorOfReel && !isAuthorOfComment) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const { error } = await supabaseAdmin
      .from('reel_comments')
      .delete()
      .eq('id', commentId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  })
);

router.post(
  '/from-moment/:momentId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const momentId = z.string().uuid().parse(req.params.momentId);
    const body = z.object({ caption: z.string().max(2000).optional() }).parse(req.body ?? {});
    const profileId = await getProfileIdByUserId(req.userId!);
    if (!profileId) return res.status(404).json({ error: 'Profile not found' });

    const { data: moment, error } = await supabaseAdmin
      .from('moments')
      .select('id, author_id, media_url, media_type, caption')
      .eq('id', momentId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!moment) return res.status(404).json({ error: 'Moment not found' });
    if (moment.author_id !== profileId) {
      return res.status(403).json({ error: 'Only the author can save a moment as a reel' });
    }
    if (moment.media_type === 'text' || !moment.media_url) {
      return res.status(400).json({ error: 'Text-only moments cannot become reels' });
    }

    const mediaUrl = moment.media_url as string;
    const resMedia = await fetch(mediaUrl);
    if (!resMedia.ok) return res.status(400).json({ error: 'Could not read moment media' });
    const buffer = Buffer.from(await resMedia.arrayBuffer());
    const ext = moment.media_type === 'video' ? 'mp4' : 'jpg';
    const path = `imports/${profileId}/${Date.now()}-${momentId}.${ext}`;
    const contentType = moment.media_type === 'video' ? 'video/mp4' : 'image/jpeg';

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('reels')
      .upload(path, buffer, { contentType, upsert: false });
    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    const { data: pub } = supabaseAdmin.storage.from('reels').getPublicUrl(path);
    const videoUrl = pub.publicUrl;
    const isImage = moment.media_type === 'image';
    const caption =
      body.caption !== undefined
        ? body.caption.trim() || null
        : ((moment.caption as string | null) ?? null);

    const { data: reelRow, error: insertErr } = await supabaseAdmin
      .from('reels')
      .insert({
        author_id: profileId,
        video_url: videoUrl,
        thumbnail_url: isImage ? videoUrl : null,
        caption,
        visibility: 'friends',
        transcode_status: isImage ? 'skipped' : 'pending',
      })
      .select()
      .single();

    if (insertErr) return res.status(500).json({ error: insertErr.message });

    if (!isImage) {
      queueReelHlsTranscode(reelRow.id as string, videoUrl, {});
    }

    const [enriched] = await enrichReels([reelRow as ReelRow], profileId);
    return res.status(201).json({ reel: enriched });
  })
);

export default router;
