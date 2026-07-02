// Supabase client — Realtime only (auth happens via Express API)
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  throw new Error(
    '[supabase] Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (project root), save the file, then restart with: npx expo start -c'
  );
}

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  // Higher heartbeat margin keeps the WebSocket healthier on web/local dev.
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});

let currentAccessToken: string | null = null;
const authChangeListeners = new Set<() => void>();

export function getSupabaseAccessToken(): string | null {
  return currentAccessToken;
}

/** Fired when the Realtime JWT changes — restart hub subscriptions. */
export function onSupabaseAuthChange(listener: () => void): () => void {
  authChangeListeners.add(listener);
  return () => authChangeListeners.delete(listener);
}

/**
 * Sync Supabase Realtime auth after login/refresh via backend API.
 *
 * We deliberately do NOT call `supabase.auth.setSession()` because:
 *  - We don't use Supabase Auth in the client (Express backend owns sign-in/refresh).
 *  - `setSession` can throw on flake or out-of-date tokens, which previously
 *    short-circuited the `realtime.setAuth` call below and left channels
 *    authenticated as `anon` → RLS rejection → silent CHANNEL_ERROR loop.
 *
 * All we need is to push the JWT into the Realtime client so its WebSocket
 * joins use the `authenticated` role.
 */
export function setSupabaseSession(accessToken: string, _refreshToken?: string) {
  if (!accessToken) return;
  const isNew = currentAccessToken !== accessToken;
  currentAccessToken = accessToken;
  try {
    supabase.realtime.setAuth(accessToken);
    if (isNew) {
      // 1-line breadcrumb so it's easy to spot in logs the moment Realtime is authed.
      console.log('[supabase] realtime auth set (token len:', accessToken.length, ')');
      authChangeListeners.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('[supabase] auth change listener error:', e);
        }
      });
    }
  } catch (e) {
    console.error('[supabase] realtime.setAuth failed:', e);
  }
}

export function clearSupabaseSession() {
  currentAccessToken = null;
  try {
    supabase.realtime.setAuth(null as unknown as string);
  } catch {
    /* ignore */
  }
}
