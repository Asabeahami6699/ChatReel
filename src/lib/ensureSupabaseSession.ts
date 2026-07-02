import type { Session } from '@supabase/supabase-js';
import { config } from './config';
import { sessionStorage } from './sessionStorage';
import { setSupabaseSession, clearSupabaseSession } from './supabase';

const REFRESH_BUFFER_SEC = 120;

/** Refresh API + Supabase Realtime JWT when expired or about to expire. */
export async function ensureSupabaseSession(): Promise<Session | null> {
  const stored = await sessionStorage.load();
  if (!stored?.access_token || !stored.refresh_token) {
    return null;
  }

  const expiresAtMs = stored.expires_at ? stored.expires_at * 1000 : 0;
  const needsRefresh =
    !expiresAtMs || expiresAtMs < Date.now() + REFRESH_BUFFER_SEC * 1000;

  try {
    if (needsRefresh) {
      const res = await fetch(`${config.apiUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: stored.refresh_token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session) {
        // Only clear local auth state when refresh token is truly invalid.
        if (res.status === 400 || res.status === 401) {
          await clearSupabaseSession();
          await sessionStorage.clear();
          return null;
        }
        // Transient backend/network issue: keep using stored token for now.
        await setSupabaseSession(stored.access_token, stored.refresh_token);
        return {
          access_token: stored.access_token,
          refresh_token: stored.refresh_token,
          expires_at: stored.expires_at,
          user: stored.user,
        } as Session;
      }
      await sessionStorage.save(data.session);
      await setSupabaseSession(data.session.access_token, data.session.refresh_token);
      return data.session as Session;
    }

    await setSupabaseSession(stored.access_token, stored.refresh_token);
    return {
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
      expires_at: stored.expires_at,
      user: stored.user,
    } as Session;
  } catch (err) {
    console.error('[ensureSupabaseSession] failed:', err);
    return null;
  }
}
