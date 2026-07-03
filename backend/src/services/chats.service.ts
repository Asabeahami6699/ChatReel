import { supabaseAdmin } from '../lib/supabaseAdmin';

export type IndividualChat = {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
};

export async function getIndividualChats(authUserId: string): Promise<IndividualChat[]> {
  const { data: currentProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('user_id', authUserId)
    .single();

  if (!currentProfile) return [];

  const { data: friendships } = await supabaseAdmin
    .from('friendships')
    .select(`
      id, user_id, friend_id,
      profiles_sender:profiles!friendships_user_id_fkey (user_id, display_name, avatar_url),
      profiles_receiver:profiles!friendships_friend_id_fkey (user_id, display_name, avatar_url)
    `)
    .or(`user_id.eq.${currentProfile.id},friend_id.eq.${currentProfile.id}`)
    .eq('status', 'accepted');

  if (!friendships?.length) return [];

  const friendsMap = new Map<string, { user_id: string; name: string; avatar_url: string }>();
  friendships.forEach((f: Record<string, unknown>) => {
    const isSender = f.user_id === currentProfile.id;
    const profile = (isSender ? f.profiles_receiver : f.profiles_sender) as {
      user_id: string;
      display_name?: string;
      avatar_url?: string;
    } | null;
    if (profile && !friendsMap.has(profile.user_id)) {
      friendsMap.set(profile.user_id, {
        user_id: profile.user_id,
        name: profile.display_name || 'User',
        avatar_url: profile.avatar_url || 'https://via.placeholder.com/48',
      });
    }
  });

  const friends = Array.from(friendsMap.values());
  const friendIds = friends.map((f) => f.user_id);
  if (!friendIds.length) return [];

  // Fetch the latest message per friend using a wide enough window, plus
  // compute true unread counts via a separate query (no global limit).
  const [{ data: messages }, { data: unreadRows }] = await Promise.all([
    supabaseAdmin
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${authUserId},receiver_id.in.(${friendIds.join(',')})),and(sender_id.in.(${friendIds.join(',')}),receiver_id.eq.${authUserId})`
      )
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('messages')
      .select('sender_id')
      .in('sender_id', friendIds)
      .eq('receiver_id', authUserId)
      .eq('is_read', false),
  ]);

  // Build per-friend unread count from the dedicated unread query.
  const unreadByFriend = new Map<string, number>();
  (unreadRows ?? []).forEach((r) => {
    const sid = r.sender_id as string;
    unreadByFriend.set(sid, (unreadByFriend.get(sid) || 0) + 1);
  });

  const formatted: IndividualChat[] = friends.map((friend) => {
    const friendMsgs =
      messages?.filter(
        (m) =>
          (m.sender_id === authUserId && m.receiver_id === friend.user_id) ||
          (m.sender_id === friend.user_id && m.receiver_id === authUserId)
      ) ?? [];

    const latest = friendMsgs[0];

    return {
      id: friend.user_id,
      user_id: friend.user_id,
      name: friend.name,
      avatar_url: friend.avatar_url,
      last_message: latest?.content,
      last_message_at: latest?.created_at,
      unread_count: unreadByFriend.get(friend.user_id) ?? 0,
    };
  });

  formatted.sort((a, b) => {
    const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return timeB - timeA;
  });

  return formatted;
}

export type GroupChat = {
  id: string;
  name: string;
  avatar_url?: string | null;
  member_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count: number;
  user_role?: 'creator' | 'admin' | 'member';
  description?: string | null;
  is_public?: boolean | null;
  creator_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_sender?: string | null;
  last_message_sender_display_name?: string;
};

const normalizeDisplayName = (profile: { display_name?: string | null; email?: string | null }) => {
  const dn = (profile?.display_name || '').trim();
  if (dn && dn !== 'Unknown User' && dn !== 'Member') return dn;
  if (profile?.email) return profile.email.split('@')[0];
  return 'Member';
};

export async function getGroupChats(authUserId: string): Promise<GroupChat[]> {
  const [creatorRes, memberRes] = await Promise.all([
    supabaseAdmin
      .from('groups')
      .select('id, name, avatar_url, description, is_public, creator_id, created_at, updated_at')
      .eq('creator_id', authUserId),
    supabaseAdmin
      .from('group_members')
      .select('group_id, role, groups!inner(id, name, avatar_url, description, is_public, creator_id, created_at, updated_at)')
      .eq('user_id', authUserId),
  ]);

  if (creatorRes.error) throw creatorRes.error;
  if (memberRes.error) throw memberRes.error;

  const groupsMap = new Map<string, Record<string, unknown>>();

  (creatorRes.data ?? []).forEach((g) => {
    groupsMap.set(g.id, { ...g, user_role: 'creator' });
  });

  (memberRes.data ?? []).forEach((row) => {
    const raw = row.groups;
    const g = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
    if (g?.id && !groupsMap.has(g.id as string)) {
      groupsMap.set(g.id as string, {
        ...g,
        user_role: row.role === 'admin' ? 'admin' : 'member',
      });
    }
  });

  const allGroupsArr = Array.from(groupsMap.values());
  if (!allGroupsArr.length) return [];

  const groupIds = allGroupsArr.map((g) => g.id as string);

  const memberCountRes = await supabaseAdmin.from('group_members').select('group_id').in('group_id', groupIds);

  const countMap = new Map<string, number>();
  (memberCountRes.data ?? []).forEach((r) => {
    countMap.set(r.group_id, (countMap.get(r.group_id) || 0) + 1);
  });
  allGroupsArr.forEach((g) => {
    if (g.user_role === 'creator') countMap.set(g.id as string, (countMap.get(g.id as string) || 0) + 1);
  });

  const msgRes = await supabaseAdmin
    .from('messages')
    .select('id, sender_id, group_id, content, is_read, created_at')
    .in('group_id', groupIds)
    .order('created_at', { ascending: false });

  if (msgRes.error) throw msgRes.error;

  const allIncomingIds: string[] = [];
  (msgRes.data ?? []).forEach((m) => {
    if (m.sender_id !== authUserId) allIncomingIds.push(m.id);
  });

  const { data: readRows } = allIncomingIds.length
    ? await supabaseAdmin
        .from('message_reads')
        .select('message_id')
        .eq('user_id', authUserId)
        .in('message_id', allIncomingIds)
    : { data: [] as { message_id: string }[] };

  const readSet = new Set((readRows ?? []).map((r) => r.message_id));

  const latestByGroup = new Map<string, (typeof msgRes.data)[0]>();
  const unreadCounts = new Map<string, number>();
  const senderIdsSet = new Set<string>();

  (msgRes.data ?? []).forEach((m) => {
    if (m.sender_id) senderIdsSet.add(m.sender_id);
    if (m.sender_id !== authUserId && !readSet.has(m.id)) {
      unreadCounts.set(m.group_id, (unreadCounts.get(m.group_id) || 0) + 1);
    }
    if (!latestByGroup.has(m.group_id)) latestByGroup.set(m.group_id, m);
  });

  const senderIds = Array.from(senderIdsSet);
  const profilesCache: Record<string, { display_name: string; avatar_url: string | null }> = {};

  if (senderIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url, email')
      .in('user_id', senderIds);

    (profiles ?? []).forEach((p) => {
      profilesCache[p.user_id] = {
        display_name: normalizeDisplayName(p),
        avatar_url: p.avatar_url ?? null,
      };
    });
  }

  const { data: currentProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name, email')
    .eq('user_id', authUserId)
    .maybeSingle();

  const currentUserDisplayName = currentProfile ? normalizeDisplayName(currentProfile) : 'You';

  const formatted: GroupChat[] = allGroupsArr.map((g) => {
    const latest = latestByGroup.get(g.id as string);
    let last_message_sender_display_name = '';
    if (latest?.sender_id) {
      last_message_sender_display_name =
        latest.sender_id === authUserId
          ? 'You'
          : profilesCache[latest.sender_id]?.display_name ?? 'Member';
    }

    return {
      id: g.id as string,
      name: g.name as string,
      avatar_url: (g.avatar_url as string) ?? null,
      description: (g.description as string) ?? null,
      is_public: (g.is_public as boolean) ?? false,
      creator_id: (g.creator_id as string) ?? null,
      created_at: (g.created_at as string) ?? null,
      updated_at: (g.updated_at as string) ?? null,
      user_role: g.user_role as GroupChat['user_role'],
      member_count: countMap.get(g.id as string) ?? 1,
      last_message: latest?.content ?? null,
      last_message_at: latest?.created_at ?? null,
      last_message_sender: latest?.sender_id ?? null,
      last_message_sender_display_name,
      unread_count: unreadCounts.get(g.id as string) ?? 0,
    };
  });

  formatted.sort((a, b) => {
    const ta = a.last_message_at
      ? new Date(a.last_message_at).getTime()
      : new Date(a.created_at ?? 0).getTime();
    const tb = b.last_message_at
      ? new Date(b.last_message_at).getTime()
      : new Date(b.created_at ?? 0).getTime();
    return tb - ta;
  });

  return formatted;
}
