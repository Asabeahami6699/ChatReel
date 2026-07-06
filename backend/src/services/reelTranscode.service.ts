import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { env } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { applyReelsCdnUrl } from '../lib/reelUrls';
import { probeVideoDimensionsFromPath } from '../lib/videoProbe';
import { moderateReelById } from './reelModeration.service';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export function isReelHlsEnabled(): boolean {
  return env.reelsHlsEnabled;
}

export type ReelTrimOptions = {
  trimStartSec?: number;
  trimEndSec?: number;
};

export type ReelSoundMixOptions = {
  soundId: string;
  soundStartSec?: number;
  originalAudioVolume?: number;
};

type ResolvedSoundMix = {
  audioUrl: string;
  soundStartSec: number;
  originalAudioVolume: number;
};

async function loadSoundMixOptions(reelId: string): Promise<ResolvedSoundMix | null> {
  const { data, error } = await supabaseAdmin
    .from('reels')
    .select('sound_id, sound_start_sec, original_audio_volume')
    .eq('id', reelId)
    .maybeSingle();
  if (error || !data?.sound_id) return null;

  const { data: sound, error: soundErr } = await supabaseAdmin
    .from('reel_sounds')
    .select('audio_url')
    .eq('id', data.sound_id)
    .eq('is_active', true)
    .maybeSingle();
  if (soundErr || !sound?.audio_url) return null;

  return {
    audioUrl: sound.audio_url as string,
    soundStartSec: Number(data.sound_start_sec ?? 0),
    originalAudioVolume: Number(data.original_audio_volume ?? 1),
  };
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

async function mixSoundIntoVideo(
  inputPath: string,
  outputPath: string,
  sound: ResolvedSoundMix,
  trim?: ReelTrimOptions
): Promise<void> {
  const tmpSound = path.join(path.dirname(outputPath), 'sound.mp3');
  await downloadToFile(sound.audioUrl, tmpSound);

  const trimStart = trim?.trimStartSec ?? 0;
  const trimEnd = trim?.trimEndSec;
  const trimDuration =
    trimEnd != null && trimEnd > trimStart ? trimEnd - trimStart : undefined;

  const origVol = Math.max(0, Math.min(1, sound.originalAudioVolume));
  const soundStart = Math.max(0, sound.soundStartSec);

  let filterComplex: string;
  if (origVol <= 0.001) {
    filterComplex =
      trimDuration != null
        ? `[1:a]atrim=duration=${trimDuration},asetpts=PTS-STARTPTS[aout]`
        : `[1:a]asetpts=PTS-STARTPTS[aout]`;
  } else {
    const soundChain =
      trimDuration != null
        ? `[1:a]atrim=duration=${trimDuration},asetpts=PTS-STARTPTS,volume=1[a1]`
        : `[1:a]asetpts=PTS-STARTPTS,volume=1[a1]`;
    filterComplex = `[0:a]volume=${origVol}[a0];${soundChain};[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
  }

  const videoInputOpts: string[] = [];
  if (trimStart > 0) videoInputOpts.push('-ss', String(trimStart));
  if (trimDuration != null) videoInputOpts.push('-t', String(trimDuration));

  const soundInputOpts: string[] = [];
  if (soundStart > 0) soundInputOpts.push('-ss', String(soundStart));

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(inputPath);
    if (videoInputOpts.length) cmd.inputOptions(videoInputOpts);
    cmd
      .input(tmpSound)
      .inputOptions(soundInputOpts)
      .complexFilter(filterComplex)
      .outputOptions([
        '-map',
        '0:v:0',
        '-map',
        '[aout]',
        '-c:v',
        'libx264',
        '-profile:v',
        'baseline',
        '-c:a',
        'aac',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  await fs.rm(tmpSound, { force: true }).catch(() => undefined);
}

export async function transcodeReelToHls(
  reelId: string,
  videoUrl: string,
  trim?: ReelTrimOptions
): Promise<string | null> {
  if (!isReelHlsEnabled()) return null;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `reel-hls-${reelId}-`));
  try {
    await supabaseAdmin
      .from('reels')
      .update({ transcode_status: 'processing' })
      .eq('id', reelId);

    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const inputPath = path.join(tmpDir, 'input.mp4');
    await fs.writeFile(inputPath, Buffer.from(await res.arrayBuffer()));

    const modDecision = await moderateReelById(reelId, inputPath);
    if (modDecision.status === 'rejected' || modDecision.status === 'flagged') {
      await supabaseAdmin
        .from('reels')
        .update({ transcode_status: 'failed' })
        .eq('id', reelId);
      return null;
    }

    try {
      const { data: existing } = await supabaseAdmin
        .from('reels')
        .select('width, height')
        .eq('id', reelId)
        .maybeSingle();
      if (!existing?.width || !existing?.height) {
        const dims = await probeVideoDimensionsFromPath(inputPath);
        await supabaseAdmin
          .from('reels')
          .update({ width: dims.width, height: dims.height })
          .eq('id', reelId);
      }
    } catch (probeErr) {
      console.warn('[reels] dimension probe failed:', probeErr);
    }

    const soundMix = await loadSoundMixOptions(reelId);
    let encodeInputPath = inputPath;
    if (soundMix) {
      const mixedPath = path.join(tmpDir, 'mixed.mp4');
      try {
        await mixSoundIntoVideo(inputPath, mixedPath, soundMix, trim);
        encodeInputPath = mixedPath;
        trim = undefined;
      } catch (mixErr) {
        console.error('[reels] sound mix failed, continuing with original audio:', mixErr);
      }
    }

    const outDir = path.join(tmpDir, 'hls');
    await fs.mkdir(outDir);
    const playlistPath = path.join(outDir, 'index.m3u8');

    const trimStart = trim?.trimStartSec ?? 0;
    const trimEnd = trim?.trimEndSec;
    const trimDuration =
      trimEnd != null && trimEnd > trimStart ? trimEnd - trimStart : undefined;

    const inputOpts: string[] = [];
    if (trimStart > 0) inputOpts.push('-ss', String(trimStart));

    const outputOpts = [
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-profile:v baseline',
      '-level 3.0',
      '-start_number 0',
      '-hls_time 2',
      '-hls_list_size 0',
      '-hls_segment_type mpegts',
      '-hls_segment_filename',
      path.join(outDir, 'segment_%03d.ts'),
      '-f hls',
    ];
    if (trimDuration != null) outputOpts.unshift('-t', String(trimDuration));

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(encodeInputPath);
      if (inputOpts.length) cmd.inputOptions(inputOpts);
      cmd
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(outputOpts)
        .output(playlistPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const hlsPrefix = `hls/${reelId}`;
    const files = await fs.readdir(outDir);
    for (const file of files) {
      const body = await fs.readFile(path.join(outDir, file));
      const contentType = file.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t';
      const { error } = await supabaseAdmin.storage
        .from('reels')
        .upload(`${hlsPrefix}/${file}`, body, { contentType, upsert: true });
      if (error) throw new Error(error.message);
    }

    const { data } = supabaseAdmin.storage.from('reels').getPublicUrl(`${hlsPrefix}/index.m3u8`);
    const hlsUrl = data.publicUrl;

    await supabaseAdmin
      .from('reels')
      .update({ hls_url: hlsUrl, transcode_status: 'ready' })
      .eq('id', reelId);

    return applyReelsCdnUrl(hlsUrl);
  } catch (err) {
    console.error('[reels] HLS transcode failed:', err);
    await supabaseAdmin
      .from('reels')
      .update({ transcode_status: 'failed' })
      .eq('id', reelId);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Fire-and-forget HLS job after reel publish. */
export function queueReelHlsTranscode(
  reelId: string,
  videoUrl: string,
  trim?: ReelTrimOptions
): void {
  if (!isReelHlsEnabled()) {
    void supabaseAdmin
      .from('reels')
      .update({ transcode_status: 'skipped' })
      .eq('id', reelId);
    return;
  }
  void transcodeReelToHls(reelId, videoUrl, trim);
}
