import { env } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { moderateReelById } from '../services/reelModeration.service';
import {
  isReelHlsEnabled,
  muxSoundIntoReelMp4,
  transcodeReelToHls,
} from '../services/reelTranscode.service';

/**
 * Recover reels stranded in `pending`/`processing` transcode or `pending`
 * moderation after a process restart. The in-process transcode/moderation
 * jobs are fire-and-forget, so a crash mid-job leaves rows stuck forever
 * (invisible to everyone but the author).
 *
 * Conservative by design: only rows older than a stale threshold, small
 * batches, sequential processing, and an overlap guard so runs never stack.
 */

const BATCH_LIMIT = 10;

type StuckReelRow = {
  id: string;
  video_url: string | null;
  sound_id: string | null;
  transcode_status: string;
  moderation_status: string;
  created_at: string;
};

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;

function staleCutoffIso(): string {
  return new Date(Date.now() - env.reelReconcileStaleMinutes * 60_000).toISOString();
}

/** Re-read the row so handlers stay idempotent and skip deleted/settled reels. */
async function refetchReel(reelId: string): Promise<StuckReelRow | null> {
  const { data, error } = await supabaseAdmin
    .from('reels')
    .select('id, video_url, sound_id, transcode_status, moderation_status, created_at')
    .eq('id', reelId)
    .maybeSingle();
  if (error || !data) return null;
  return data as StuckReelRow;
}

async function countReelMedia(reelId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('reel_media')
    .select('id', { count: 'exact', head: true })
    .eq('reel_id', reelId);
  if (error) return 0;
  return count ?? 0;
}

async function runModerationIfPending(reelId: string): Promise<void> {
  const reel = await refetchReel(reelId);
  if (!reel || reel.moderation_status !== 'pending') return;
  try {
    await moderateReelById(reelId);
  } catch (err) {
    console.warn('[reconcile] moderation retry failed:', reelId, err);
  }
}

async function recoverStuckTranscode(row: StuckReelRow): Promise<void> {
  const reel = await refetchReel(row.id);
  if (!reel) return; // deleted since query
  if (reel.transcode_status !== 'pending' && reel.transcode_status !== 'processing') {
    return; // settled in the meantime
  }
  if (!reel.video_url) {
    await supabaseAdmin.from('reels').update({ transcode_status: 'failed' }).eq('id', reel.id);
    return;
  }

  // Multi-media reels never get a reel-level transcode in the publish flow;
  // their pending status is expected. Just make sure moderation isn't stuck.
  const mediaCount = await countReelMedia(reel.id);
  if (mediaCount > 1) {
    await runModerationIfPending(reel.id);
    return;
  }

  try {
    if (isReelHlsEnabled()) {
      // Trim options aren't persisted, so a retry encodes the full source.
      // Playback already falls back to the untrimmed MP4 while stuck, so this
      // is no worse for viewers and it unblocks moderation + HLS delivery.
      await transcodeReelToHls(reel.id, reel.video_url);
    } else {
      // Sets 'ready' after muxing when a sound is attached, else 'skipped'.
      await muxSoundIntoReelMp4(reel.id, reel.video_url);
    }
  } catch (err) {
    console.warn('[reconcile] transcode retry failed:', reel.id, err);
  }

  await runModerationIfPending(reel.id);
}

export async function reconcileStuckReels(): Promise<{
  transcodeRetried: number;
  moderationRetried: number;
}> {
  if (running) return { transcodeRetried: 0, moderationRetried: 0 };
  running = true;

  let transcodeRetried = 0;
  let moderationRetried = 0;

  try {
    const cutoff = staleCutoffIso();
    const handled = new Set<string>();

    const { data: stuckTranscode, error: tErr } = await supabaseAdmin
      .from('reels')
      .select('id, video_url, sound_id, transcode_status, moderation_status, created_at')
      .in('transcode_status', ['pending', 'processing'])
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (tErr) {
      console.warn('[reconcile] stuck transcode query failed:', tErr.message);
    } else {
      for (const row of (stuckTranscode ?? []) as StuckReelRow[]) {
        handled.add(row.id);
        await recoverStuckTranscode(row);
        transcodeRetried += 1;
      }
    }

    const { data: stuckModeration, error: mErr } = await supabaseAdmin
      .from('reels')
      .select('id, video_url, sound_id, transcode_status, moderation_status, created_at')
      .eq('moderation_status', 'pending')
      .in('transcode_status', ['ready', 'failed', 'skipped'])
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (mErr) {
      console.warn('[reconcile] stuck moderation query failed:', mErr.message);
    } else {
      for (const row of (stuckModeration ?? []) as StuckReelRow[]) {
        if (handled.has(row.id)) continue;
        await runModerationIfPending(row.id);
        moderationRetried += 1;
      }
    }

    if (transcodeRetried || moderationRetried) {
      console.log(
        `[reconcile] reels recovered: transcode=${transcodeRetried} moderation=${moderationRetried}`
      );
    }
  } catch (err) {
    console.warn('[reconcile] pass failed:', err);
  } finally {
    running = false;
  }

  return { transcodeRetried, moderationRetried };
}

/** Background loop (single API instance). Disable with REEL_RECONCILE_INTERVAL_MS=0 */
export function startReelReconcileScheduler(): void {
  const intervalMs = env.reelReconcileIntervalMs;
  if (!intervalMs || intervalMs <= 0) {
    console.log('[reconcile] reel scheduler disabled');
    return;
  }
  if (timer) return;
  console.log(
    `[reconcile] reel scheduler every ${intervalMs}ms, staleAfter=${env.reelReconcileStaleMinutes}m`
  );
  // First pass shortly after boot to catch reels stranded by the restart.
  bootTimer = setTimeout(() => {
    bootTimer = null;
    void reconcileStuckReels();
  }, 20_000);
  timer = setInterval(() => {
    void reconcileStuckReels();
  }, intervalMs);
}

export function stopReelReconcileScheduler(): void {
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
