import { env } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';

/**
 * Move old, settled messages into messages_archive so the hot table stays small.
 * Batched; safe to run repeatedly. Skips unread DMs.
 */
export async function archiveOldMessages(opts?: {
  olderThanDays?: number;
  batchSize?: number;
}): Promise<{ archived: number; error?: string }> {
  const days = opts?.olderThanDays ?? env.messageArchiveAfterDays;
  const batchSize = opts?.batchSize ?? 200;
  if (days <= 0) return { archived: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .lt('created_at', cutoff)
    .or('is_read.eq.true,group_id.not.is.null')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    // Table missing until phase2 SQL is applied.
    if (/messages_archive|does not exist|schema cache/i.test(error.message)) {
      return { archived: 0, error: error.message };
    }
    return { archived: 0, error: error.message };
  }

  const rows = candidates ?? [];
  if (!rows.length) return { archived: 0 };

  // Prefer unread=false for DMs; groups already included via or().
  const toArchive = rows.filter((m) => {
    if (m.group_id) return true;
    return m.is_read === true;
  });
  if (!toArchive.length) return { archived: 0 };

  const ids = toArchive.map((m) => m.id as string);
  const stamped = toArchive.map((m) => ({
    ...m,
    archived_at: new Date().toISOString(),
  }));

  const { error: insertErr } = await supabaseAdmin.from('messages_archive').insert(stamped);
  if (insertErr) {
    return { archived: 0, error: insertErr.message };
  }

  const { error: delErr } = await supabaseAdmin.from('messages').delete().in('id', ids);
  if (delErr) {
    return { archived: 0, error: delErr.message };
  }

  console.log(
    JSON.stringify({
      type: 'message_archive',
      archived: ids.length,
      cutoff,
      at: new Date().toISOString(),
    })
  );
  return { archived: ids.length };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Background loop (single API instance). Disable with MESSAGE_ARCHIVE_INTERVAL_MS=0 */
export function startMessageArchiveScheduler() {
  const intervalMs = env.messageArchiveIntervalMs;
  if (!intervalMs || intervalMs <= 0) {
    console.log('[archive] scheduler disabled');
    return;
  }
  if (timer) return;
  console.log(`[archive] scheduler every ${intervalMs}ms, olderThan=${env.messageArchiveAfterDays}d`);
  // First run after a short delay so boot isn't blocked.
  setTimeout(() => {
    void archiveOldMessages().catch((e) => console.warn('[archive]', e));
  }, 30_000);
  timer = setInterval(() => {
    void archiveOldMessages().catch((e) => console.warn('[archive]', e));
  }, intervalMs);
}
