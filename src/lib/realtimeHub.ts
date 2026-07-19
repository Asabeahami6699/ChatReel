import type { RealtimeChannel } from '@supabase/supabase-js';
import { ensureProfileId } from '../stores/profileStore';
import { ensureSupabaseSession } from './ensureSupabaseSession';
import { supabase } from './supabase';
import { dispatchMessageRow } from './chatRealtime';
import { createRealtimeTopic, type RealtimeTopic } from './realtimeTopic';
import { requestIncomingCallResync } from './callIncomingBridge';
import type { CallDTO } from './api';

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
  reelGifts: createRealtimeTopic('reelGifts'),
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
    profileId = await ensureProfileId(authUserId);
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
      // Own profile (settings) + any peer presence/last_seen change for open chats.
      if (row?.user_id) {
        realtimeTopics.profiles.notify();
      }
    }
  );

  hubChannel = ch;
  let errorRetries = 0;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  // Bind message_reads on the CORE channel (avoid a dedicated aux join that often CHANNEL_ERRORs).
  ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'message_reads' },
    (payload) => {
      const row = (payload.new ?? payload.old) as { user_id?: string } | undefined;
      if (row?.user_id === authUserId) {
        realtimeTopics.messages.notifyImmediate();
      }
    }
  );

  ch.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED') {
      errorRetries = 0;
      // Short resync: call + chat UIs catch up after Realtime reconnects.
      realtimeTopics.calls.notifyImmediate();
      realtimeTopics.callParticipants.notifyImmediate();
      realtimeTopics.messages.notifyImmediate();
      // Start optional tables only after core is healthy — reduces join storms on web.
      if (auxChannels.size === 0) {
        startAuxChannels(authUserId, profileId);
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('[realtimeHub] status', status, err);
      if (errorRetries < 3) {
        errorRetries += 1;
        try {
          await ensureSupabaseSession();
        } catch {
          /* ignore */
        }
      } else if (!restartTimer) {
        // Full hub rebuild after auth refresh failed to heal the channel.
        const uid = authUserId;
        restartTimer = setTimeout(() => {
          restartTimer = null;
          void startRealtimeHub(uid, { force: true }).catch((e) => {
            console.error('[realtimeHub] force restart failed', e);
          });
        }, 2500);
      }
    } else if (status === 'CLOSED' && !hubCloseIntentional) {
      console.warn('[realtimeHub] channel closed unexpectedly');
    }
  });
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

function startAuxChannels(authUserId: string, _profileId: string | null) {
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
  startAuxChannel(
    'reel-gifts',
    authUserId,
    { event: 'INSERT', schema: 'public', table: 'reel_gifts' },
    () => realtimeTopics.reelGifts.notify()
  );

  startAuxChannel('calls', authUserId, { event: '*', schema: 'public', table: 'calls' }, (payload) => {
    const row = (payload.new ?? payload.old) as
      | (Partial<CallDTO> & { caller_id?: string; callee_id?: string; id?: string })
      | undefined;
    if (!row) return;
    if (row.caller_id === authUserId || row.callee_id === authUserId) {
      // Push snapshot so incoming UI can paint before HTTP catch-up.
      if (
        row.id &&
        row.callee_id === authUserId &&
        (row.status === 'ringing' || row.status === 'accepted')
      ) {
        requestIncomingCallResync(row.id, row as CallDTO);
      } else if (row.id) {
        requestIncomingCallResync(row.id);
      }
      // Immediate: caller must jump to ActiveCall as soon as callee accepts.
      realtimeTopics.calls.notifyImmediate();
    }
  });
  startAuxChannel(
    'call-participants',
    authUserId,
    { event: '*', schema: 'public', table: 'call_participants' },
    () => {
      // Any participant change may affect an open call UI (join/leave/hold).
      // Listeners refetch their own call via HTTP — this is a wake, not a payload.
      realtimeTopics.callParticipants.notifyImmediate();
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
