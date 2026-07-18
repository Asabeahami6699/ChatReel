import { env } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { cleanupMomentMedia } from '../services/momentStorage.service';

/**
 * Purge moments that expired a while ago, then release their media objects.
 * Rows are removed in small batches with a 24h grace period past expiry, so
 * nothing visible to users is ever touched. Storage cleanup runs after the
 * rows are gone and only removes `moments/…` objects no longer referenced.
 */

const BATCH_SIZE = 100;
const GRACE_HOURS = 24;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;

export async function cleanupExpiredMoments(): Promise<{ deleted: number }> {
  if (running) return { deleted: 0 };
  running = true;

  try {
    const cutoff = new Date(Date.now() - GRACE_HOURS * 3_600_000).toISOString();

    const { data: expired, error } = await supabaseAdmin
      .from('moments')
      .select('id, media_url, thumbnail_url, media_type')
      .lt('expires_at', cutoff)
      .order('expires_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.warn('[moments] expired query failed:', error.message);
      return { deleted: 0 };
    }

    const rows = expired ?? [];
    if (!rows.length) return { deleted: 0 };

    const ids = rows.map((m) => m.id as string);
    const urls = rows.flatMap((m) => [
      m.media_url as string | null,
      m.thumbnail_url as string | null,
    ]);

    const { error: delErr } = await supabaseAdmin.from('moments').delete().in('id', ids);
    if (delErr) {
      console.warn('[moments] expired delete failed:', delErr.message);
      return { deleted: 0 };
    }

    await cleanupMomentMedia(urls);

    console.log(
      JSON.stringify({
        type: 'moment_cleanup',
        deleted: ids.length,
        cutoff,
        at: new Date().toISOString(),
      })
    );
    return { deleted: ids.length };
  } catch (err) {
    console.warn('[moments] cleanup pass failed:', err);
    return { deleted: 0 };
  } finally {
    running = false;
  }
}

/** Background loop (single API instance). Disable with MOMENT_CLEANUP_INTERVAL_MS=0 */
export function startMomentCleanupScheduler(): void {
  const intervalMs = env.momentCleanupIntervalMs;
  if (!intervalMs || intervalMs <= 0) {
    console.log('[moments] cleanup scheduler disabled');
    return;
  }
  if (timer) return;
  console.log(`[moments] cleanup scheduler every ${intervalMs}ms, grace=${GRACE_HOURS}h`);
  bootTimer = setTimeout(() => {
    bootTimer = null;
    void cleanupExpiredMoments();
  }, 60_000);
  timer = setInterval(() => {
    void cleanupExpiredMoments();
  }, intervalMs);
}

export function stopMomentCleanupScheduler(): void {
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
