import { api, type CallDTO } from '../lib/api';

export type CallPeerInfo = {
  peerName: string;
  peerAvatar: string | null;
};

/** Resolve the other party's auth user id for a direct call. */
export function resolveCallPeerAuthId(
  call: CallDTO,
  myAuthId: string | null | undefined
): string | null {
  if (call.scope !== 'direct') return null;
  if (myAuthId) {
    if (call.caller_id === myAuthId) return call.callee_id;
    if (call.callee_id === myAuthId) return call.caller_id;
  }
  // Prefer the callee on unknown identity — callers usually need the callee name
  // on the outgoing screen. Incoming overlay should pass preferCaller.
  return call.callee_id ?? call.caller_id ?? null;
}

/** Incoming UI: the ringer is always the caller for direct calls. */
export function resolveIncomingPeerAuthId(call: CallDTO): string | null {
  if (call.scope !== 'direct') return null;
  return call.caller_id || null;
}

export function formatCallPeerName(profile: {
  display_name?: string | null;
  email?: string | null;
} | null): string {
  const name = profile?.display_name?.trim();
  if (name) return name;
  const emailName = profile?.email?.split('@')[0]?.trim();
  if (emailName) return emailName;
  return 'Contact';
}

/** Load peer display name / avatar for a call (group or direct). */
export async function fetchCallPeerInfo(
  call: CallDTO,
  myAuthId: string | null | undefined,
  opts?: { preferIncomingCaller?: boolean }
): Promise<CallPeerInfo> {
  if (call.scope === 'group' && call.group_id) {
    try {
      const { group } = await api.groups.get(call.group_id);
      const g = group as { name?: string; avatar_url?: string | null };
      return {
        peerName: g.name?.trim() || 'Group call',
        peerAvatar: g.avatar_url ?? null,
      };
    } catch {
      return { peerName: 'Group call', peerAvatar: null };
    }
  }

  const targetAuth = opts?.preferIncomingCaller
    ? resolveIncomingPeerAuthId(call)
    : resolveCallPeerAuthId(call, myAuthId);
  if (!targetAuth) {
    return { peerName: 'Contact', peerAvatar: null };
  }

  try {
    const { profile } = await api.profiles.getByUserId(targetAuth);
    const p = profile as {
      display_name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    };
    return {
      peerName: formatCallPeerName(p),
      peerAvatar: p.avatar_url ?? null,
    };
  } catch {
    return { peerName: 'Contact', peerAvatar: null };
  }
}
