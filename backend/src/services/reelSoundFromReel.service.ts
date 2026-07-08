import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  canViewReel,
  enrichReels,
  getAcceptedFriendIds,
  type ReelRow,
} from './reels.service';
import {
  getReelSoundById,
  getReelSoundBySourceReelId,
  type ReelSoundRow,
} from './reelSounds.service';
import { extractSoundFromVideoUrl } from './reelSoundExtract.service';

async function resolveReelVideoUrl(reelId: string, reel: ReelRow): Promise<string> {
  if (reel.video_url) return reel.video_url;

  const { data: media, error } = await supabaseAdmin
    .from('reel_media')
    .select('media_url, media_type')
    .eq('reel_id', reelId)
    .eq('media_type', 'video')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (media?.media_url) return media.media_url as string;
  throw new Error('This reel has no video audio to use');
}

function authorHandle(displayName: string | null | undefined, email: string | null | undefined): string {
  const name = displayName?.trim() || email?.split('@')[0] || 'creator';
  return name.replace(/\s+/g, '').toLowerCase();
}

/** Resolve or create a reusable library sound from a reel (library track or original audio). */
export async function resolveSoundFromReel(input: {
  reelId: string;
  requesterProfileId: string;
  requesterAuthUserId: string;
}): Promise<ReelSoundRow> {
  const { data: reel, error } = await supabaseAdmin
    .from('reels')
    .select('*')
    .eq('id', input.reelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!reel) throw new Error('Reel not found');

  const row = reel as ReelRow;
  const friendSet = await getAcceptedFriendIds(input.requesterProfileId);
  const canView = await canViewReel(
    row,
    input.requesterProfileId,
    friendSet,
    input.requesterAuthUserId
  );
  if (!canView) throw new Error('Reel not found');

  if (row.sound_id) {
    const existing = await getReelSoundById(row.sound_id);
    if (existing) return existing;
  }

  const deduped = await getReelSoundBySourceReelId(input.reelId);
  if (deduped) return deduped;

  const [enriched] = await enrichReels([row], input.requesterProfileId);
  const author = enriched?.author;
  const handle = authorHandle(author?.display_name, author?.email);
  const artist = author?.display_name?.trim() || author?.email?.split('@')[0] || 'Creator';
  const videoUrl = await resolveReelVideoUrl(input.reelId, row);

  return extractSoundFromVideoUrl({
    videoUrl,
    profileId: row.author_id,
    title: `Original audio · @${handle}`,
    artist,
    durationSec: row.duration,
    sourceType: 'ugc',
    sourceReelId: input.reelId,
  });
}
