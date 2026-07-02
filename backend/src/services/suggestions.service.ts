import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getProfileIdByUserId } from '../middleware/auth';

export type SuggestedProfile = {
  id: string;
  user_id: string;
  display_name: string;
  email?: string;
  avatar_url?: string;
  region?: string;
  country?: string;
  mutual_friends_count?: number;
  reason?: string;
  created_at?: string;
};

export async function getProfileSuggestions(authUserId: string) {
  const profileId = await getProfileIdByUserId(authUserId);
  if (!profileId) {
    return { mutual: [], location: [], new_users: [] };
  }

  const [mutual, location, newUsers] = await Promise.all([
    getMutualSuggestions(profileId, authUserId),
    getLocationSuggestions(profileId, authUserId),
    getNewUserSuggestions(authUserId),
  ]);

  return { mutual, location, new_users: newUsers };
}

async function getMutualSuggestions(profileId: string, authUserId: string): Promise<SuggestedProfile[]> {
  const { data: userFriends } = await supabaseAdmin
    .from('friendships')
    .select('friend_id, user_id')
    .or(`user_id.eq.${profileId},friend_id.eq.${profileId}`)
    .eq('status', 'accepted');

  if (!userFriends?.length) return [];

  const friendProfileIds = userFriends.map((f) =>
    f.user_id === profileId ? f.friend_id : f.user_id
  );

  const { data: potentialFriends } = await supabaseAdmin
    .from('friendships')
    .select(`
      user_id, friend_id,
      profiles:profiles!friendships_friend_id_fkey (
        id, user_id, display_name, email, avatar_url, region, country
      )
    `)
    .in('user_id', friendProfileIds)
    .neq('friend_id', profileId)
    .eq('status', 'accepted');

  const friendCountMap = new Map<string, number>();
  potentialFriends?.forEach((pf: Record<string, unknown>) => {
    const profile = pf.profiles as SuggestedProfile | null;
    if (profile && profile.id !== profileId && profile.user_id !== authUserId) {
      friendCountMap.set(profile.id, (friendCountMap.get(profile.id) || 0) + 1);
    }
  });

  return Array.from(friendCountMap.entries())
    .map(([id, count]) => {
      const row = potentialFriends?.find(
        (pf: Record<string, unknown>) => (pf.profiles as SuggestedProfile | null)?.id === id
      );
      const profile = row?.profiles as SuggestedProfile | undefined;
      if (!profile) return null;
      return {
        ...profile,
        mutual_friends_count: count,
        reason: `${count} mutual friend${count !== 1 ? 's' : ''}`,
      };
    })
    .filter(Boolean) as SuggestedProfile[];
}

async function getLocationSuggestions(profileId: string, authUserId: string): Promise<SuggestedProfile[]> {
  const { data: currentUser } = await supabaseAdmin
    .from('profiles')
    .select('region, country')
    .eq('id', profileId)
    .single();

  if (!currentUser?.region) return [];

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, display_name, email, avatar_url, region, country')
    .eq('region', currentUser.region)
    .neq('user_id', authUserId)
    .limit(8);

  return (data ?? []).map((p) => ({ ...p, reason: `Lives in ${p.region}` }));
}

async function getNewUserSuggestions(authUserId: string): Promise<SuggestedProfile[]> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, display_name, email, avatar_url, region, country, created_at')
    .neq('user_id', authUserId)
    .order('created_at', { ascending: false })
    .limit(6);

  return (data ?? []).map((p) => ({ ...p, reason: 'New to platform' }));
}
