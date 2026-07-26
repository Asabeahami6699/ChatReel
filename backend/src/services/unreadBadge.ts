import { supabaseAdmin } from '../lib/supabaseAdmin';

/**
 * Approximate home-screen badge: unread DMs + unread group messages.
 * Kept cheap enough to run on the push send path.
 */
export async function getUnreadBadgeCount(authUserId: string): Promise<number> {
  if (!authUserId) return 0;

  const [{ count: dmCount }, memberships] = await Promise.all([
    supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', authUserId)
      .eq('is_read', false),
    supabaseAdmin.from('group_members').select('group_id').eq('user_id', authUserId),
  ]);

  let groupUnread = 0;
  const groupIds = (memberships.data ?? [])
    .map((r) => r.group_id as string)
    .filter(Boolean);

  if (groupIds.length) {
    // Cap the scan so push latency stays bounded for very large histories.
    const { data: recent } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id')
      .in('group_id', groupIds)
      .neq('sender_id', authUserId)
      .order('created_at', { ascending: false })
      .limit(400);

    const ids = (recent ?? []).map((m) => m.id as string);
    if (ids.length) {
      const { data: reads } = await supabaseAdmin
        .from('message_reads')
        .select('message_id')
        .eq('user_id', authUserId)
        .in('message_id', ids);
      const readSet = new Set((reads ?? []).map((r) => r.message_id as string));
      groupUnread = ids.reduce((n, id) => n + (readSet.has(id) ? 0 : 1), 0);
    }
  }

  return Math.max(0, (dmCount ?? 0) + groupUnread);
}
