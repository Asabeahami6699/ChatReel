export type CallFriendRow = {
  userId: string;
  name: string;
  avatar: string | null;
};

/** Map accepted friendship rows to callable friend contacts. */
export function friendshipsToCallFriends(
  friendships: Record<string, unknown>[],
  myProfileId: string | null
): CallFriendRow[] {
  const rows: CallFriendRow[] = [];
  const seenUserIds = new Set<string>();
  for (const f of friendships) {
    const isSender = f.user_id === myProfileId;
    const profile = (isSender ? f.receiver_profile : f.sender_profile) as {
      user_id?: string;
      display_name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    } | null;
    const userId = profile?.user_id;
    if (!userId || seenUserIds.has(userId)) continue;
    seenUserIds.add(userId);
    rows.push({
      userId,
      name:
        profile?.display_name?.trim() ||
        profile?.email?.split('@')[0] ||
        'Friend',
      avatar: profile?.avatar_url ?? null,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
