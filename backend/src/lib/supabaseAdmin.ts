import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from '../config/env';

// Node.js < 22 has no native WebSocket; required by @supabase/realtime-js
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws as unknown as typeof WebSocket;
}

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

/** Service-role client — bypasses RLS. Use only on the server. */
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, clientOptions);

/** Anon client for auth sign-in/sign-up (returns user-facing sessions). */
export const supabaseAuth = createClient(
  env.supabaseUrl,
  env.supabaseAnonKey || env.supabaseServiceRoleKey,
  clientOptions
);
