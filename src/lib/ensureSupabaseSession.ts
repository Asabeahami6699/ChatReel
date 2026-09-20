import type { Session } from '@supabase/supabase-js';
import { config } from './config';
import { sessionStorage } from './sessionStorage';
import { setSupabaseSession, clearSupabaseSession } from './supabase';

const REFRESH_BUFFER_SEC = 120;

export type RefreshOutcome =
  | { kind: 'ok'; session: Session }
  /** No tokens on disk. */
  | { kind: 'none' }
  /** Refresh token rejected — local session cleared. */
  | { kind: 'invalid' }
  /** Network/5xx — keep existing tokens so the user stays logged in. */
  | { kind: 'transient'; session: Session };

function sessionFromStored(stored: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: Session['user'];
}): Session {
  return {
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expires_at: stored.expires_at,
    user: stored.user,
  } as Session;
}

/**
 * Refresh the access JWT when expired (or when `force`).
 * Never clears local auth on transient failures — only on hard 400/401 from /refresh.
 */
export async function refreshAuthSession(opts?: { force?: boolean }): Promise<RefreshOutcome> {
  const stored = await sessionStorage.load();
  if (!stored?.access_token || !stored.refresh_token) {
    return { kind: 'none' };
  }

  const expiresAtMs = stored.expires_at ? stored.expires_at * 1000 : 0;
  const needsRefresh =
    Boolean(opts?.force) ||
    !expiresAtMs ||
    expiresAtMs < Date.now() + REFRESH_BUFFER_SEC * 1000;

  if (!needsRefresh) {
    await setSupabaseSession(stored.access_token, stored.refresh_token);
    return { kind: 'ok', session: sessionFromStored(stored) };
  }

  try {
    const res = await fetch(`${config.apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.session) {
      if (res.status === 400 || res.status === 401) {
        await clearSupabaseSession();
        await sessionStorage.clear();
        return { kind: 'invalid' };
      }
      await setSupabaseSession(stored.access_token, stored.refresh_token);
      return { kind: 'transient', session: sessionFromStored(stored) };
    }

    await sessionStorage.save(data.session);
    await setSupabaseSession(data.session.access_token, data.session.refresh_token);
    return { kind: 'ok', session: data.session as Session };
  } catch (err) {
    console.error('[refreshAuthSession] failed:', err);
    await setSupabaseSession(stored.access_token, stored.refresh_token).catch(() => {});
    return { kind: 'transient', session: sessionFromStored(stored) };
  }
}

/** Refresh JWT / Realtime token when expired or about to expire. */
export async function ensureSupabaseSession(opts?: { force?: boolean }): Promise<Session | null> {
  const outcome = await refreshAuthSession(opts);
  if (outcome.kind === 'ok' || outcome.kind === 'transient') return outcome.session;
  return null;
}
