import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { env, isReelModerationEnabled } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export type ModerationDecision = {
  status: ModerationStatus;
  score: number;
  reason: string | null;
};

type NudityPayload = {
  sexual_activity?: number;
  sexual_display?: number;
  erotica?: number;
  very_suggestive?: number;
  suggestive?: number;
  mildly_suggestive?: number;
};

type VisualPayload = {
  nudity?: NudityPayload;
  gore?: { prob?: number };
  offensive?: { prob?: number };
  weapon?: { classes?: Record<string, number> };
  recreational_drug?: { prob?: number };
};

type TextCheckPayload = {
  status?: string;
  profanity?: {
    matches?: Array<{ type?: string; intensity?: string; match?: string }>;
  };
};

type VideoSyncPayload = VisualPayload & {
  data?: { frames?: Array<VisualPayload & { info?: { id?: string; position?: number } }> };
};

const IMAGE_MODELS = 'nudity-2.1,gore-2.0,offensive,weapon,recreational_drug';
const VIDEO_SYNC_MODELS = 'nudity-2.1,gore-2.0,offensive,weapon,recreational_drug';

/** Fast local block for obvious caption terms (runs before Sightengine). */
const CAPTION_BLOCKLIST =
  /\b(porn|porno|xxx|nsfw|onlyfans|sex\s*tape|hentai|x\s*rated)\b/i;

/** Legitimate context where partial nudity / swimwear / education is expected. */
const EDUCATIONAL_CONTEXT =
  /\b(educational|education|documentary|medical|anatomy|health|science|tutorial|learn|lecture|class|fitness|workout|yoga|art|artist|fashion|swimwear|swimsuit|bikini|beach|model|photoshoot|runway|breast\s*cancer|self[\s-]?exam|maternity|pregnancy|breastfeeding|nursing|dermatolog|skin\s*care|spa|wellness)\b/i;

function captionHasEducationalContext(caption?: string | null): boolean {
  if (!caption?.trim()) return false;
  return EDUCATIONAL_CONTEXT.test(caption.trim());
}

function explicitScore(nudity?: NudityPayload): number {
  if (!nudity) return 0;
  return Math.max(
    nudity.sexual_activity ?? 0,
    nudity.sexual_display ?? 0,
    nudity.erotica ?? 0
  );
}

function suggestiveScore(nudity?: NudityPayload): number {
  if (!nudity) return 0;
  return Math.max(nudity.very_suggestive ?? 0, nudity.suggestive ?? 0, nudity.mildly_suggestive ?? 0);
}

function weaponScore(payload?: VisualPayload): number {
  const classes = payload?.weapon?.classes;
  if (!classes) return 0;
  return Math.max(...Object.values(classes), 0);
}

function evaluateVisualPayload(
  payload: VisualPayload,
  opts?: { educationalContext?: boolean }
): ModerationDecision {
  const explicit = explicitScore(payload.nudity);
  const suggestive = suggestiveScore(payload.nudity);
  const gore = payload.gore?.prob ?? 0;
  const offensive = payload.offensive?.prob ?? 0;
  const drugs = payload.recreational_drug?.prob ?? 0;
  const weapon = weaponScore(payload);

  const score = Math.max(explicit, suggestive, gore, offensive, drugs, weapon);
  const educational = opts?.educationalContext ?? false;

  // Hard reject: explicit sexual content, gore, weapons, drugs
  if (
    explicit >= env.reelModeration.rejectThreshold ||
    gore >= 0.65 ||
    weapon >= 0.7 ||
    drugs >= 0.75
  ) {
    return {
      status: 'rejected',
      score,
      reason: 'Explicit or prohibited visual content detected',
    };
  }

  // Educational / fashion / swimwear: allow suggestive scores when explicit nudity is low
  if (educational && explicit < 0.45 && suggestive < 0.95) {
    return { status: 'approved', score, reason: null };
  }

  // Fashion / swimwear without explicit nudity — approve (common false-positive case)
  if (explicit < 0.3 && offensive < 0.75) {
    return { status: 'approved', score, reason: null };
  }

  // Very suggestive with low explicit — flag for review, don't reject
  if (explicit < 0.25 && suggestive >= 0.88) {
    return {
      status: 'flagged',
      score,
      reason: 'Suggestive imagery — visible to you while under review',
    };
  }

  if (
    explicit >= env.reelModeration.flagThreshold ||
    (suggestive >= 0.92 && explicit >= 0.15) ||
    offensive >= 0.8
  ) {
    return {
      status: 'flagged',
      score,
      reason: 'Borderline content — hidden from others pending review',
    };
  }

  return { status: 'approved', score, reason: null };
}

function evaluateTextPayload(payload: TextCheckPayload): ModerationDecision {
  const matches = payload.profanity?.matches ?? [];
  const sexualHigh = matches.some((m) => m.type === 'sexual' && m.intensity === 'high');
  const sexualMedium = matches.some((m) => m.type === 'sexual' && m.intensity === 'medium');

  if (sexualHigh) {
    return {
      status: 'rejected',
      score: 1,
      reason: 'Caption violates community guidelines',
    };
  }
  if (sexualMedium || matches.some((m) => m.type === 'sexual')) {
    return {
      status: 'flagged',
      score: 0.8,
      reason: 'Caption flagged for review',
    };
  }
  return { status: 'approved', score: 0, reason: null };
}

function evaluateVideoSyncPayload(
  payload: VideoSyncPayload,
  opts?: { educationalContext?: boolean }
): ModerationDecision {
  let decision: ModerationDecision = { status: 'approved', score: 0, reason: null };

  for (const frame of payload.data?.frames ?? []) {
    decision = mergeDecisions(decision, evaluateVisualPayload(frame, opts));
    if (decision.status === 'rejected') break;
  }

  return mergeDecisions(decision, evaluateVisualPayload(payload, opts));
}

function mergeDecisions(current: ModerationDecision, next: ModerationDecision): ModerationDecision {
  const rank: Record<ModerationStatus, number> = {
    approved: 0,
    pending: 0,
    flagged: 1,
    rejected: 2,
  };
  if (rank[next.status] > rank[current.status]) return next;
  if (rank[next.status] === rank[current.status] && next.score > current.score) return next;
  return current;
}

async function sightengineFormRequest(
  endpoint: string,
  fields: Record<string, string>,
  file?: { buffer: Buffer; filename: string; mime: string }
): Promise<unknown> {
  const form = new FormData();
  form.append('api_user', env.sightengine.apiUser);
  form.append('api_secret', env.sightengine.apiSecret);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  if (file) {
    form.append('media', new Blob([file.buffer], { type: file.mime }), file.filename);
  }

  const res = await fetch(`https://api.sightengine.com/1.0/${endpoint}`, {
    method: 'POST',
    body: form as unknown as RequestInit['body'],
  });
  const json = (await res.json()) as { status?: string; error?: { message?: string } };
  if (!res.ok || json.status === 'failure') {
    throw new Error(json.error?.message ?? `Sightengine error (${res.status})`);
  }
  return json;
}

async function checkImageBuffer(
  buffer: Buffer,
  filename: string,
  opts?: { educationalContext?: boolean }
): Promise<ModerationDecision> {
  const payload = (await sightengineFormRequest(
    'check.json',
    { models: IMAGE_MODELS },
    { buffer, filename, mime: 'image/jpeg' }
  )) as VisualPayload;
  return evaluateVisualPayload(payload, opts);
}

async function checkImageUrl(
  url: string,
  opts?: { educationalContext?: boolean }
): Promise<ModerationDecision> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Thumbnail fetch failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return checkImageBuffer(buffer, 'thumb.jpg', opts);
}

async function checkVideoSync(
  buffer: Buffer,
  filename: string,
  opts?: { educationalContext?: boolean }
): Promise<ModerationDecision> {
  const payload = (await sightengineFormRequest(
    'video/check-sync.json',
    { models: VIDEO_SYNC_MODELS },
    { buffer, filename, mime: 'video/mp4' }
  )) as VideoSyncPayload;
  return evaluateVideoSyncPayload(payload, opts);
}

export async function checkCaption(caption: string): Promise<ModerationDecision> {
  const trimmed = caption.trim();
  if (!trimmed) return { status: 'approved', score: 0, reason: null };

  if (CAPTION_BLOCKLIST.test(trimmed)) {
    return {
      status: 'rejected',
      score: 1,
      reason: 'Caption violates community guidelines',
    };
  }

  if (!isReelModerationEnabled()) {
    return { status: 'approved', score: 0, reason: null };
  }

  const form = new FormData();
  form.append('api_user', env.sightengine.apiUser);
  form.append('api_secret', env.sightengine.apiSecret);
  form.append('text', trimmed.slice(0, 2000));
  form.append('models', 'text-content');
  form.append('mode', 'rules');
  form.append('lang', 'en');

  const res = await fetch('https://api.sightengine.com/1.0/text/check.json', {
    method: 'POST',
    body: form as unknown as RequestInit['body'],
  });
  const json = (await res.json()) as TextCheckPayload & { error?: { message?: string }; status?: string };
  if (!res.ok || json.status === 'failure') {
    throw new Error(json.error?.message ?? `Sightengine text error (${res.status})`);
  }
  return evaluateTextPayload(json);
}

async function extractVideoFrames(videoPath: string, maxFrames: number): Promise<string[]> {
  const outDir = path.join(path.dirname(videoPath), 'mod-frames');
  await fs.mkdir(outDir, { recursive: true });
  const pattern = path.join(outDir, 'frame_%03d.jpg');

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions(['-vf', 'fps=1/2', '-frames:v', String(maxFrames)])
      .output(pattern)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  const files = (await fs.readdir(outDir))
    .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort();
  return files.map((f) => path.join(outDir, f));
}

async function checkVideoFile(
  videoPath: string,
  durationSec?: number | null,
  opts?: { educationalContext?: boolean }
): Promise<ModerationDecision> {
  const buffer = await fs.readFile(videoPath);
  const effectiveDuration = durationSec ?? 120;

  if (effectiveDuration <= 55 && buffer.length <= 48 * 1024 * 1024) {
    try {
      return await checkVideoSync(buffer, 'reel.mp4', opts);
    } catch (err) {
      console.warn('[moderation] video sync failed, falling back to frames:', err);
    }
  }

  let decision: ModerationDecision = { status: 'approved', score: 0, reason: null };
  const frames = await extractVideoFrames(videoPath, 12);
  for (const framePath of frames) {
    const frameBuffer = await fs.readFile(framePath);
    const next = await checkImageBuffer(frameBuffer, path.basename(framePath), opts);
    decision = mergeDecisions(decision, next);
    if (decision.status === 'rejected') break;
  }
  return decision;
}

export async function cleanupRejectedReelStorage(
  reelId: string,
  videoUrl?: string | null,
  thumbnailUrl?: string | null
) {
  const { cleanupReelStorage, getReelMediaUrls } = await import('./reelStorage.service');
  // Rejected reels keep their DB row, so reel_media is still queryable here.
  const mediaUrls = await getReelMediaUrls(reelId);
  await cleanupReelStorage(reelId, [videoUrl, thumbnailUrl, ...mediaUrls]);
}

export async function applyModerationDecision(
  reelId: string,
  decision: ModerationDecision,
  opts?: { videoUrl?: string | null; thumbnailUrl?: string | null }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('reels')
    .update({
      moderation_status: decision.status,
      moderation_reason: decision.reason,
      moderation_score: decision.score,
    })
    .eq('id', reelId);

  if (error) {
    console.error('[moderation] DB update failed (run migration 022?):', error.message);
    throw error;
  }

  console.log(`[moderation] reel ${reelId} → ${decision.status} (score ${decision.score.toFixed(2)})`);

  if (decision.status === 'rejected') {
    await cleanupRejectedReelStorage(reelId, opts?.videoUrl, opts?.thumbnailUrl);
  }

  if (decision.status === 'approved') {
    const { notifyAudienceOfApprovedReelSafe } = await import('./reelPublishNotify.service');
    notifyAudienceOfApprovedReelSafe(reelId);
  }
}

async function autoApprove(reelId: string, reason: string) {
  await applyModerationDecision(reelId, {
    status: 'approved',
    score: 0,
    reason,
  });
}

export async function moderateReelById(
  reelId: string,
  localVideoPath?: string
): Promise<ModerationDecision> {
  if (!isReelModerationEnabled()) {
    await autoApprove(reelId, 'Moderation disabled');
    return { status: 'approved', score: 0, reason: null };
  }

  const { data: reel, error } = await supabaseAdmin
    .from('reels')
    .select(
      'id, video_url, thumbnail_url, caption, duration, transcode_status, moderation_status, moderation_score, moderation_reason'
    )
    .eq('id', reelId)
    .maybeSingle();

  if (error || !reel) {
    throw new Error(error?.message ?? 'Reel not found for moderation');
  }

  if (reel.moderation_status === 'approved' || reel.moderation_status === 'rejected') {
    return {
      status: reel.moderation_status,
      score: reel.moderation_score ?? 0,
      reason: reel.moderation_reason ?? null,
    };
  }

  let decision: ModerationDecision = { status: 'approved', score: 0, reason: null };
  const educationalContext = captionHasEducationalContext(reel.caption as string | null);
  const visualOpts = { educationalContext };

  try {
    if (reel.caption && typeof reel.caption === 'string' && reel.caption.trim()) {
      decision = mergeDecisions(decision, await checkCaption(reel.caption.trim()));
      if (decision.status === 'rejected') {
        await applyModerationDecision(reelId, decision, {
          videoUrl: reel.video_url as string,
          thumbnailUrl: reel.thumbnail_url as string | null,
        });
        return decision;
      }
    }

    if (reel.thumbnail_url) {
      decision = mergeDecisions(
        decision,
        await checkImageUrl(reel.thumbnail_url as string, visualOpts)
      );
    }

    const isImageReel = reel.transcode_status === 'skipped';
    if (localVideoPath) {
      decision = mergeDecisions(
        decision,
        await checkVideoFile(localVideoPath, reel.duration as number | null, visualOpts)
      );
    } else if (isImageReel) {
      decision = mergeDecisions(
        decision,
        await checkImageUrl(reel.video_url as string, visualOpts)
      );
    } else {
      const res = await fetch(reel.video_url as string);
      if (!res.ok) throw new Error(`Video fetch failed (${res.status})`);
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `reel-mod-${reelId}-`));
      try {
        const videoPath = path.join(tmpDir, 'input.mp4');
        await fs.writeFile(videoPath, Buffer.from(await res.arrayBuffer()));
        decision = mergeDecisions(
          decision,
          await checkVideoFile(videoPath, reel.duration as number | null, visualOpts)
        );
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  } catch (err) {
    console.error('[moderation] scan failed, flagging reel:', err);
    decision = {
      status: 'flagged',
      score: 1,
      reason: 'Automated review unavailable — hidden pending manual check',
    };
  }

  await applyModerationDecision(reelId, decision, {
    videoUrl: reel.video_url as string,
    thumbnailUrl: reel.thumbnail_url as string | null,
  });

  return decision;
}

/** Fire-and-forget moderation for image-only / no-transcode reels. */
export function scheduleReelModeration(reelId: string): void {
  void moderateReelById(reelId).catch((err) => {
    console.error('[moderation] schedule failed:', reelId, err);
  });
}

/** Block upload before files are stored if caption is clearly prohibited. */
export async function assertCaptionAllowed(caption?: string | null): Promise<void> {
  if (!caption?.trim()) return;
  const decision = await checkCaption(caption.trim());
  if (decision.status === 'rejected') {
    throw new Error(decision.reason ?? 'Caption violates community guidelines');
  }
}
