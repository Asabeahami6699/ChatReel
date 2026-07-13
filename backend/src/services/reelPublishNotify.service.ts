import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAcceptedFriendIds } from './reels.service';
import {
  getAuthUserIdsByProfileIds,
  sendPushToUsersSafe,
} from './push.service';

/**
 * Notify friends (or group members) when a reel becomes publicly visible.
 * Called after moderation approves an upload.
 */
export async function notifyAudienceOfApprovedReel(reelId: string): Promise<void> {
  const { data: reel, error } = await supabaseAdmin
    .from('reels')
    .select(
      'id, author_id, caption, visibility, group_id, moderation_status, scheduled_publish_at'
    )
    .eq('id', reelId)
    .maybeSingle();

  if (error || !reel) return;
  if (reel.moderation_status !== 'approved') return;

  // Don't notify for future-scheduled posts (no publish worker yet).
  if (
    reel.scheduled_publish_at &&
    new Date(reel.scheduled_publish_at as string).getTime() > Date.now()
  ) {
    return;
  }

  const authorId = reel.author_id as string;
  const { data: author } = await supabaseAdmin
    .from('profiles')
    .select('display_name, email, user_id')
    .eq('id', authorId)
    .maybeSingle();

  const authorName =
    author?.display_name || author?.email?.split('@')[0] || 'Someone';
  const caption = typeof reel.caption === 'string' ? reel.caption.trim() : '';
  const body = caption
    ? caption.slice(0, 120)
    : `${authorName} posted a new reel`;

  const payload = {
    title: `${authorName} posted a reel`,
    body,
    data: {
      type: 'new_reel',
      reel_id: reelId,
      author_id: authorId,
      screen: 'ReelPreview',
    },
  };

  let recipientAuthIds: string[] = [];

  if (reel.visibility === 'group' && reel.group_id) {
    const { data: members } = await supabaseAdmin
      .from('group_members')
      .select('user_id')
      .eq('group_id', reel.group_id);
    recipientAuthIds = [
      ...new Set(
        (members ?? [])
          .map((m) => m.user_id as string)
          .filter((uid) => uid && uid !== author?.user_id)
      ),
    ];
  } else {
    // public + friends: notify accepted friends (app "followers")
    const friendProfileIds = [...(await getAcceptedFriendIds(authorId))];
    recipientAuthIds = await getAuthUserIdsByProfileIds(friendProfileIds);
    if (author?.user_id) {
      recipientAuthIds = recipientAuthIds.filter((uid) => uid !== author.user_id);
    }
  }

  if (recipientAuthIds.length === 0) return;
  sendPushToUsersSafe(recipientAuthIds, payload);
}

export function notifyAudienceOfApprovedReelSafe(reelId: string): void {
  void notifyAudienceOfApprovedReel(reelId).catch((err) => {
    console.warn('[push] new reel notify failed:', reelId, err);
  });
}
