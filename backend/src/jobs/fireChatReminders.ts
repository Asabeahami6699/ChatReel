import { env } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { sendPushToUserSafe } from '../services/push.service';

const BATCH_SIZE = 50;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Claim due pending reminders, mark fired, and push the user.
 * Uses a short status flip so concurrent API instances don't double-send often.
 */
export async function fireDueChatReminders(): Promise<{ fired: number }> {
  if (running) return { fired: 0 };
  running = true;

  try {
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabaseAdmin
      .from('chat_reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('remind_at', nowIso)
      .order('remind_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.warn('[reminders] due query failed:', error.message);
      return { fired: 0 };
    }

    const rows = due ?? [];
    if (!rows.length) return { fired: 0 };

    let fired = 0;
    for (const row of rows) {
      const id = row.id as string;
      const userId = row.user_id as string;

      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from('chat_reminders')
        .update({
          status: 'fired',
          fired_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (claimErr || !claimed) continue;

      const chatName =
        (typeof row.chat_name === 'string' && row.chat_name.trim()) || 'Chat';
      const preview =
        (typeof row.preview_text === 'string' && row.preview_text.trim()) ||
        'You set a reminder for this conversation';
      const note =
        typeof row.note === 'string' && row.note.trim() ? row.note.trim() : null;
      const body = note ? `${preview}\n📝 ${note}` : preview;

      sendPushToUserSafe(userId, {
        title: `${chatName} needs your attention`,
        body: body.slice(0, 240),
        data: {
          type: 'chat_reminder',
          reminder_id: id,
          chat_id: row.chat_id,
          chat_type: row.chat_type,
          chat_name: chatName,
          message_id: row.message_id ?? undefined,
          note: note ?? undefined,
        },
        tag: `chat_reminder_${id}`,
        collapseId: `chat_reminder_${id}`,
      });
      fired += 1;
    }

    if (fired > 0) {
      console.log(
        JSON.stringify({
          type: 'chat_reminders_fired',
          fired,
          at: new Date().toISOString(),
        })
      );
    }
    return { fired };
  } catch (err) {
    console.warn('[reminders] fire pass failed:', err);
    return { fired: 0 };
  } finally {
    running = false;
  }
}

/** Background loop. Disable with CHAT_REMINDER_INTERVAL_MS=0 */
export function startChatReminderScheduler(): void {
  const intervalMs = env.chatReminderIntervalMs;
  if (!intervalMs || intervalMs <= 0) {
    console.log('[reminders] scheduler disabled');
    return;
  }
  if (timer) return;
  console.log(`[reminders] scheduler every ${intervalMs}ms`);
  bootTimer = setTimeout(() => {
    void fireDueChatReminders();
  }, 8_000);
  timer = setInterval(() => {
    void fireDueChatReminders();
  }, intervalMs);
}

export function stopChatReminderScheduler(): void {
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
