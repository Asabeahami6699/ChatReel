import type { RealtimeChannel } from '@supabase/supabase-js';
import { api } from './api';
import { ensureSupabaseSession } from './ensureSupabaseSession';
import { supabase } from './supabase';
import { dispatchMessageRow } from './chatRealtime';
import { createRealtimeTopic, type RealtimeTopic } from './realtimeTopic';

export const realtimeTopics = {
  friendships: createRealtimeTopic('friendships'),
  messages: createRealtimeTopic('messages'),
  groups: createRealtimeTopic('groups'),
  groupMembers: createRealtimeTopic('groupMembers'),
  groupInvites: createRealtimeTopic('groupInvites'),
  profiles: createRealtimeTopic('profiles'),
  qrSessions: createRealtimeTopic('qrSessions'),
  linkedDevices: createRealtimeTopic('linkedDevices'),
  reels: createRealtimeTopic('reels'),
  reelLikes: createRealtimeTopic('reelLikes'),
  reelComments: createRealtimeTopic('reelComments'),
  calls: createRealtimeTopic('calls'),
  callParticipants: createRealtimeTopic('callParticipants'),
  moments: createRealtimeTopic('moments'),
  momentViews: createRealtimeTopic('momentViews'),
} as const;

export type RealtimeTopicName = keyof typeof realtimeTopics;

let hubChannel: RealtimeChannel | null = null;
let hubAuthUserId: string | null = null;
const auxChannels = new Map<string, RealtimeChannel>();

export function getRealtimeTopic(name: RealtimeTopicName): RealtimeTopic {
  return realtimeTopics[name];
}

export function notifyRealtimeTopic(name: RealtimeTopicName) {
  realtimeTopics[name].notifyImmediate();
}

/**
 * Start one global Supabase Realtime channel for the signed-in user.
 *
 * IMPORTANT: We register ONE binding per (schema, table) on this channel
 * (event '*', no server-side filter) and dispatch to the right topic
 * client-side. This avoids the Supabase Realtime quirk where multiple
 * postgres_changes filters on the same channel/table silently drop events.
 */
export async function startRealtimeHub(
  authUserId: string,
  options?: { force?: boolean }
): Promise<void> {
  if (!options?.force && hubChannel && hubAuthUserId === authUserId) return;

  const session = await ensureSupabaseSession();
  if (!session) {
    console.warn('[realtimeHub] skipped — no valid Supabase session');
    return;
  }

  stopRealtimeHub();
  hubAuthUserId = authUserId;

  let profileId: string | null = null;
  try {
    const { profile } = await api.profiles.me();
    profileId = (profile?.id as string) ?? null;
  } catch {
    console.warn('[realtimeHub] could not load profile id');
  }

  const ch = supabase.channel(`app-realtime-core:${authUserId}`);

  // friendships: filter client-side using profileId (no row-level filter to avoid Realtime quirks)
  ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'friendships' },
    (payload) => {
      const row = (payload.new ?? payload.old) as
        | { user_id?: string; friend_id?: string }
        | undefined;
      if (!profileId) return;
      if (!row) return;
      if (row.user_id === profileId || row.friend_id === profileId) {
        console.log('[realtimeHub] friendships event');
        realtimeTopics.friendships.notify();
      }
    }
  );

  ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'messages' },
    (payload) => {
      const row = (payload.new ?? payload.old) as
        | { sender_id?: string; receiver_id?: string; group_id?: string; id?: string }
        | undefined;
      console.log(
        '[realtimeHub] messages',
        payload.eventType,
        row?.id,
        'sender:',
        row?.sender_id,
        'receiver:',
        row?.receiver_id,
        'group:',
        row?.group_id
      );
      if (row?.id && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE')) {
        dispatchMessageRow(row, payload.eventType);
      }
      realtimeTopics.messages.notifyImmediate();
    }
  );

  ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'groups' },
    () => realtimeTopics.groups.notify()
  );

  ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'group_members' },
    () => realtimeTopics.groupMembers.notify()
  );

  ch.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'profiles' },
    (payload) => {
      const row = (payload.new ?? payload.old) as { user_id?: string } | undefined;
      if (row?.user_id === authUserId) {
        realtimeTopics.profiles.notify();
      }
    }
  );

  hubChannel = ch;
  let errorRetries = 0;
  ch.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED') {
      errorRetries = 0;
      console.log('[realtimeHub] subscribed for', authUserId);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('[realtimeHub] status', status, err);
      if (errorRetries < 3) {
        errorRetries += 1;
        // Re-push the JWT in case the previous join lost the auth race or the
        // token rotated. supabase-js will auto-reconnect after this.
        try {
          await ensureSupabaseSession();
        } catch {
          /* ignore */
        }
      }
    } else if (status === 'CLOSED' && !hubCloseIntentional) {
      console.warn('[realtimeHub] channel closed unexpectedly');
    }
  });

  startAuxChannels(authUserId, profileId);
}

let hubCloseIntentional = false;

function startAuxChannel(
  key: string,
  authUserId: string,
  config: Parameters<RealtimeChannel['on']>[1],
  onEvent: (payload: any) => void
) {
  const channel = supabase
    .channel(`app-realtime-${key}:${authUserId}`)
    .on('postgres_changes', config, onEvent);

  auxChannels.set(key, channel);
  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      // Optional channels should never break core chat/friends realtime.
      console.warn(`[realtimeHub] optional channel ${key} unavailable`, status, err);
    }
  });
}

function startAuxChannels(authUserId: string, profileId: string | null) {
  startAuxChannel(
    'group-invites',
    authUserId,
    { event: '*', schema: 'public', table: 'group_invites' },
    () => realtimeTopics.groupInvites.notify()
  );

  startAuxChannel(
    'qr-sessions',
    authUserId,
    { event: '*', schema: 'public', table: 'qr_sessions' },
    (payload) => {
      const row = (payload.new ?? payload.old) as { user_id?: string } | undefined;
      if (row?.user_id === authUserId) {
        realtimeTopics.qrSessions.notify();
      }
    }
  );

  startAuxChannel(
    'linked-devices',
    authUserId,
    { event: 'INSERT', schema: 'public', table: 'linked_devices' },
    (payload) => {
      const row = (payload.new ?? payload.old) as
        | { user_id?: string; linked_user_id?: string }
        | undefined;
      if (row?.user_id === authUserId || row?.linked_user_id === authUserId) {
        realtimeTopics.linkedDevices.notify();
      }
    }
  );

  startAuxChannel('reels', authUserId, { event: '*', schema: 'public', table: 'reels' }, () =>
    realtimeTopics.reels.notify()
  );
  startAuxChannel(
    'reel-likes',
    authUserId,
    { event: '*', schema: 'public', table: 'reel_likes' },
    () => realtimeTopics.reelLikes.notify()
  );
  startAuxChannel(
    'reel-comments',
    authUserId,
    { event: '*', schema: 'public', table: 'reel_comments' },
    () => realtimeTopics.reelComments.notify()
  );

  startAuxChannel('calls', authUserId, { event: '*', schema: 'public', table: 'calls' }, (payload) => {
    const row = (payload.new ?? payload.old) as { caller_id?: string; callee_id?: string } | undefined;
    if (row?.caller_id === authUserId || row?.callee_id === authUserId) {
      realtimeTopics.calls.notify();
    }
  });
  startAuxChannel(
    'call-participants',
    authUserId,
    { event: '*', schema: 'public', table: 'call_participants' },
    (payload) => {
      const row = (payload.new ?? payload.old) as { user_id?: string; profile_id?: string } | undefined;
      if (row?.user_id === authUserId || (profileId && row?.profile_id === profileId)) {
        realtimeTopics.callParticipants.notify();
      }
    }
  );

  startAuxChannel('moments', authUserId, { event: '*', schema: 'public', table: 'moments' }, () =>
    realtimeTopics.moments.notifyImmediate()
  );
  startAuxChannel(
    'moment-views',
    authUserId,
    { event: '*', schema: 'public', table: 'moment_views' },
    () => realtimeTopics.momentViews.notify()
  );
}

export function stopRealtimeHub() {
  if (hubChannel) {
    hubCloseIntentional = true;
    supabase.removeChannel(hubChannel);
    hubChannel = null;
    // reset shortly after so a later unexpected close is still surfaced.
    setTimeout(() => {
      hubCloseIntentional = false;
    }, 1000);
  }
  for (const [, channel] of auxChannels) {
    supabase.removeChannel(channel);
  }
  auxChannels.clear();
  hubAuthUserId = null;
}
