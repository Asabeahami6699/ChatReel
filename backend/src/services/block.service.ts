import { supabaseAdmin } from '../lib/supabaseAdmin';

/**
 * True when either user has blocked the other (friendships.status = 'blocked').
 * Args are auth user ids.
 */
export async function areAuthUsersBlocked(
  authA: string,
  authB: string
): Promise<boolean> {
  if (!authA || !authB || authA === authB) return false;

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id')
    .in('user_id', [authA, authB]);

  const profA = profiles?.find((p) => p.user_id === authA)?.id as string | undefined;
  const profB = profiles?.find((p) => p.user_id === authB)?.id as string | undefined;
  if (!profA || !profB) return false;

  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('id')
    .eq('status', 'blocked')
    .or(
      `and(user_id.eq.${profA},friend_id.eq.${profB}),and(user_id.eq.${profB},friend_id.eq.${profA})`
    )
    .limit(1);

  if (error) {
    console.warn('[block] lookup failed:', error.message);
    return false;
  }
  return Boolean(data && data.length > 0);
}

/**
 * Profile ids that the viewer has blocked or that have blocked the viewer.
 */
export async function getBlockedProfileIdsFor(viewerProfileId: string): Promise<Set<string>> {
  if (!viewerProfileId) return new Set();

  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('user_id, friend_id')
    .eq('status', 'blocked')
    .or(`user_id.eq.${viewerProfileId},friend_id.eq.${viewerProfileId}`);

  if (error) {
    console.warn('[block] list failed:', error.message);
    return new Set();
  }

  const out = new Set<string>();
  for (const row of data ?? []) {
    if (row.user_id === viewerProfileId && row.friend_id) out.add(row.friend_id as string);
    if (row.friend_id === viewerProfileId && row.user_id) out.add(row.user_id as string);
  }
  return out;
}

/** Auth user ids blocked in either direction relative to viewerAuthId. */
export async function getBlockedAuthIdsFor(viewerAuthId: string): Promise<Set<string>> {
  if (!viewerAuthId) return new Set();

  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('user_id', viewerAuthId)
    .maybeSingle();
  if (!me?.id) return new Set();

  const blockedProfiles = await getBlockedProfileIdsFor(me.id as string);
  if (blockedProfiles.size === 0) return new Set();

  const { data: rows } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .in('id', Array.from(blockedProfiles));

  return new Set(
    (rows ?? [])
      .map((r) => r.user_id as string | null)
      .filter((id): id is string => Boolean(id))
  );
}
