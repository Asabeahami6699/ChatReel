import { supabaseAdmin } from '../lib/supabaseAdmin';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function getAuthUserIdByProfileId(profileId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('id', profileId)
    .maybeSingle();
  return data?.user_id ?? null;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const { data: tokens, error } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !tokens?.length) return;

  const messages = tokens.map((row) => ({
    to: row.token,
    sound: 'default' as const,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    channelId:
      payload.data?.type === 'reel_gift' ||
      payload.data?.type === 'reel_like' ||
      payload.data?.type === 'reel_comment'
        ? 'reel_inbox'
        : 'default',
    priority: 'high' as const,
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[push] Expo API error:', res.status, text);
    }
  } catch (err) {
    console.warn('[push] Failed to send:', err);
  }
}

export function sendPushToUserSafe(userId: string, payload: PushPayload): void {
  void sendPushToUser(userId, payload);
}
