import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { videoHasAudioFromFfmpegStderr } from '../lib/videoProbe';
import { createReelSound, type ReelSoundRow } from './reelSounds.service';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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
  if (durationSec != null && durationSec > 0) return Math.min(durationSec, 90);
  return 90;
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
  const outputPath = path.join(tmpDir, 'extracted.mp3');
  const maxDur = extractMaxDurationSec(input.durationSec);

  try {
    let stderr = '';
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input.videoUrl)
        .inputOptions(['-nostdin', '-rw_timeout', '15000000'])
        .outputOptions(['-vn'])
        .duration(maxDur)
        .audioCodec('libmp3lame')
        .audioBitrate('96k')
        .output(outputPath)
        .on('stderr', (line: string) => {
          stderr += line;
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const stat = await fs.stat(outputPath).catch(() => null);
    if (!stat || stat.size < 500) {
      throw new Error('This video has no audio track to extract');
    }
    if (!videoHasAudioFromFfmpegStderr(stderr)) {
      throw new Error('This video has no audio track to extract');
    }

    const storagePath = `sounds/extracted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const body = await fs.readFile(outputPath);
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('reels')
      .upload(storagePath, body, { contentType: 'audio/mpeg', upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data } = supabaseAdmin.storage.from('reels').getPublicUrl(storagePath);
    const sound = await createReelSound({
      title: input.title.trim() || 'Extracted audio',
      artist: input.artist ?? null,
      audio_url: data.publicUrl,
      preview_url: data.publicUrl,
      duration_sec: input.durationSec ?? null,
      uploaded_by: input.profileId,
      source_type: input.sourceType ?? 'extracted',
      source_reel_id: input.sourceReelId ?? null,
    });

    if (input.videoUrl.includes('/extract-temp/')) {
      await deleteStorageObjectIfPresent(input.videoUrl);
    }

    return sound;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
