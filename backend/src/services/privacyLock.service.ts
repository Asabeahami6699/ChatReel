import { supabaseAdmin } from '../lib/supabaseAdmin';

export type UserPrivacyLock = {
  user_id: string;
  app_lock_enabled: boolean;
  chat_lock_enabled: boolean;
  updated_at: string;
};

export async function getUserPrivacyLock(userId: string): Promise<UserPrivacyLock> {
  const { data, error } = await supabaseAdmin
    .from('user_privacy_lock')
    .select('user_id, app_lock_enabled, chat_lock_enabled, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !/does not exist|relation/i.test(error.message)) {
    throw new Error(error.message);
  }

  if (data) {
    return {
      user_id: data.user_id as string,
      app_lock_enabled: Boolean(data.app_lock_enabled),
      chat_lock_enabled: Boolean(data.chat_lock_enabled),
      updated_at: (data.updated_at as string) || new Date().toISOString(),
    };
  }

  return {
    user_id: userId,
    app_lock_enabled: false,
    chat_lock_enabled: false,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertUserPrivacyLock(
  userId: string,
  patch: { app_lock_enabled?: boolean; chat_lock_enabled?: boolean }
): Promise<UserPrivacyLock> {
  const current = await getUserPrivacyLock(userId);
  const next = {
    user_id: userId,
    app_lock_enabled:
      typeof patch.app_lock_enabled === 'boolean'
        ? patch.app_lock_enabled
        : current.app_lock_enabled,
    chat_lock_enabled:
      typeof patch.chat_lock_enabled === 'boolean'
        ? patch.chat_lock_enabled
        : current.chat_lock_enabled,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('user_privacy_lock')
    .upsert(next, { onConflict: 'user_id' })
    .select('user_id, app_lock_enabled, chat_lock_enabled, updated_at')
    .single();

  if (error) {
    // Migration not applied yet — keep local-only behavior without crashing.
    if (/does not exist|relation/i.test(error.message)) {
      return next;
    }
    throw new Error(error.message);
  }

  return {
    user_id: data.user_id as string,
    app_lock_enabled: Boolean(data.app_lock_enabled),
    chat_lock_enabled: Boolean(data.chat_lock_enabled),
    updated_at: (data.updated_at as string) || next.updated_at,
  };
}
