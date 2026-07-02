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

export async function getGroupDetails(groupId: string) {
  const { data: groupData, error: groupError } = await supabaseAdmin
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single();

  if (groupError || !groupData) throw new Error('Group not found');

  const { data: membersData, error: membersError } = await supabaseAdmin
    .from('group_members')
    .select('*')
    .eq('group_id', groupId);

  if (membersError) throw membersError;

  const memberUserIds = [...new Set((membersData ?? []).map((m) => m.user_id).filter(Boolean))];

  const [profilesRes, invitesRes] = await Promise.all([
    memberUserIds.length
      ? supabaseAdmin
          .from('profiles')
          .select('user_id, display_name, avatar_url, email')
          .in('user_id', memberUserIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from('group_invites')
      .select('*')
      .eq('group_id', groupId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);

  const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p]));
  const creatorId = groupData.creator_id;

  const members = (membersData ?? [])
    .map((member) => {
      const profile = profilesMap.get(member.user_id);
      return {
        ...member,
        role: member.user_id === creatorId ? 'creator' : member.role,
        profiles: profile
          ? {
              user_id: profile.user_id,
              display_name: profile.display_name || `User ${profile.user_id?.slice(0, 8)}`,
              avatar_url: profile.avatar_url,
              email: profile.email || 'No email',
            }
          : {
              user_id: member.user_id,
              display_name: 'Unknown User',
              avatar_url: null,
              email: 'No email',
            },
      };
    })
    .sort((a, b) => {
      const priority: Record<string, number> = { creator: 3, admin: 2, member: 1 };
      const pa = priority[a.role] || 0;
      const pb = priority[b.role] || 0;
      if (pb !== pa) return pb - pa;
      return (a.profiles?.display_name || '').localeCompare(b.profiles?.display_name || '');
    });

  const invitesData = invitesRes.data ?? [];
  const inviteCreatorIds = [...new Set(invitesData.map((i) => i.created_by).filter(Boolean))];

  let invites = invitesData;
  if (inviteCreatorIds.length) {
    const { data: creatorProfiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', inviteCreatorIds);

    const creatorMap = new Map((creatorProfiles ?? []).map((p) => [p.user_id, p]));
    invites = invitesData.map((invite) => {
      const cp = creatorMap.get(invite.created_by);
      return {
        ...invite,
        created_by_profile: cp
          ? { display_name: cp.display_name || `User ${cp.user_id?.slice(0, 8)}`, avatar_url: cp.avatar_url }
          : { display_name: 'Unknown', avatar_url: null },
      };
    });
  }

  return {
    group: { ...groupData, members_count: membersData?.length ?? 0 },
    members,
    invites,
  };
}
