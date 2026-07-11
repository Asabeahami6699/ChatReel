import { chmodSync, existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { videoHasAudioFromFfmpegStderr } from '../lib/videoProbe';
import { createReelSound, type ReelSoundRow } from './reelSounds.service';

let ffmpegReady = false;

/** Ensure the bundled ffmpeg binary exists and is executable (Render/Linux). */
function ensureFfmpeg(): string {
  const bin = ffmpegInstaller.path;
  if (!bin || !existsSync(bin)) {
    throw new Error('Audio extract is unavailable (ffmpeg missing on server)');
  }
  if (!ffmpegReady) {
    try {
      chmodSync(bin, 0o755);
    } catch {
      /* Windows / already executable */
    }
    ffmpeg.setFfmpegPath(bin);
    ffmpegReady = true;
  }
  return bin;
}

ensureFfmpeg();

function storagePathFromPublicUrl(url: string): string | null {
  const match = /\/storage\/v1\/object\/(?:public|sign)\/reels\/(.+)$/.exec(url.split('?')[0]);
  return match ? decodeURIComponent(match[1]) : null;
}

async function deleteStorageObjectIfPresent(url: string): Promise<void> {
  const storagePath = storagePathFromPublicUrl(url);
  if (!storagePath) return;
  await supabaseAdmin.storage.from('reels').remove([storagePath]).catch(() => undefined);
}

function extractMaxDurationSec(durationSec?: number | null): number {
  if (durationSec == null || !(durationSec > 0)) return 90;
  // Guard against clients accidentally sending milliseconds.
  const sec = durationSec > 1000 ? durationSec / 1000 : durationSec;
  return Math.min(sec, 90);
}

function sanitizeExtractError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err ?? 'Could not extract audio');
  const lower = raw.toLowerCase();
  if (
    lower.includes('enoent') ||
    lower.includes('eacces') ||
    lower.includes('spawn') ||
    (lower.includes('ffmpeg') && lower.includes('not found'))
  ) {
    return new Error('Audio extract is unavailable on the server (ffmpeg)');
  }
  if (lower.includes('no audio') || lower.includes('does not contain any stream')) {
    return new Error('This video has no audio track to extract');
  }
  if (lower.includes('download') || lower.includes('empty file')) {
    return new Error(raw);
  }
  // Keep message short for clients; drop absolute paths.
  const cleaned = raw.replace(/[A-Za-z]:\\[^\s]+/g, '[path]').replace(/\/tmp\/[^\s]+/g, '[path]');
  return new Error(cleaned.slice(0, 240) || 'Could not extract audio');
}

/** Prefer Storage admin download; fall back to public HTTP fetch. */
async function materializeVideo(videoUrl: string, destPath: string): Promise<void> {
  const storagePath = storagePathFromPublicUrl(videoUrl);
  if (storagePath) {
    const { data, error } = await supabaseAdmin.storage.from('reels').download(storagePath);
    if (!error && data) {
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.byteLength >= 100) {
        await fs.writeFile(destPath, buf);
        return;
      }
    }
  }

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`Could not download video for extract (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 100) {
    throw new Error('Could not download video for extract (empty file)');
  }
  await fs.writeFile(destPath, buf);
}

function runFfmpegExtract(inputPath: string, outputPath: string, maxDur: number): Promise<string> {
  ensureFfmpeg();
  let stderr = '';
  return new Promise<string>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-nostdin', '-hide_banner'])
      .noVideo()
      .duration(maxDur)
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .audioFrequency(44100)
      .output(outputPath)
      .on('stderr', (line: string) => {
        stderr += line;
      })
      .on('end', () => resolve(stderr))
      .on('error', (err) => reject(err))
      .run();
  });
}

/** Extract the audio track from a reels-bucket video into a new library sound. */
export async function extractSoundFromVideoUrl(input: {
  videoUrl: string;
  profileId: string;
  title: string;
  artist?: string | null;
  durationSec?: number | null;
  sourceType?: 'ugc' | 'extracted';
  sourceReelId?: string | null;
}): Promise<ReelSoundRow> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-sound-extract-'));
  const inputPath = path.join(tmpDir, 'input.mp4');
  const outputPath = path.join(tmpDir, 'extracted.mp3');
  const maxDur = extractMaxDurationSec(input.durationSec);

  try {
    await materializeVideo(input.videoUrl, inputPath);

    let stderr = '';
    try {
      stderr = await runFfmpegExtract(inputPath, outputPath, maxDur);
    } catch (err) {
      throw sanitizeExtractError(err);
    }

    const stat = await fs.stat(outputPath).catch(() => null);
    if (!stat || stat.size < 500) {
      throw new Error('This video has no audio track to extract');
    }
    // Size is authoritative; stderr Audio: line is best-effort only.
    if (stat.size < 1500 && stderr && !videoHasAudioFromFfmpegStderr(stderr)) {
      throw new Error('This video has no audio track to extract');
    }

    const storagePath = `sounds/extracted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const body = await fs.readFile(outputPath);
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('reels')
      .upload(storagePath, body, { contentType: 'audio/mpeg', upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data } = supabaseAdmin.storage.from('reels').getPublicUrl(storagePath);
    const durationSec =
      input.durationSec != null && input.durationSec > 0
        ? extractMaxDurationSec(input.durationSec)
        : null;

    const sound = await createReelSound({
      title: input.title.trim() || 'Extracted audio',
      artist: input.artist ?? null,
      audio_url: data.publicUrl,
      preview_url: data.publicUrl,
      duration_sec: durationSec,
      uploaded_by: input.profileId,
      source_type: input.sourceType ?? 'extracted',
      source_reel_id: input.sourceReelId ?? null,
    });

    if (input.videoUrl.includes('/extract-temp/')) {
      await deleteStorageObjectIfPresent(input.videoUrl);
    }

    return sound;
  } catch (err) {
    throw sanitizeExtractError(err);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
