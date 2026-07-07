import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { applyReelsCdnUrl } from '../lib/reelUrls';
import type { ReelRow } from './reels.service';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const APP_NAME = 'ChatReel';

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

function ownerHandle(author: { display_name?: string | null; email?: string | null } | null): string {
  const name = author?.display_name?.trim();
  if (name) return name.replace(/\s+/g, '');
  const email = author?.email?.split('@')[0]?.trim();
  return email || 'user';
}

function mp4SourceUrl(reel: Pick<ReelRow, 'video_url' | 'hls_url' | 'transcode_status'>): string {
  const mp4 = applyReelsCdnUrl(reel.video_url) ?? reel.video_url;
  return mp4;
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

/** Burn ChatReel + @owner watermark into an MP4 for sharing. */
export async function buildWatermarkedReelDownload(
  reel: ReelRow,
  author: { display_name?: string | null; email?: string | null } | null
): Promise<{ storagePath: string; publicUrl: string }> {
  const sourceUrl = mp4SourceUrl(reel);
  if (!sourceUrl || /\.m3u8(\?|$)/i.test(sourceUrl)) {
    throw new Error('Watermarked download requires an MP4 source');
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `reel-dl-${reel.id}-`));
  const inputPath = path.join(tmpDir, 'input.mp4');
  const outputPath = path.join(tmpDir, 'watermarked.mp4');

  try {
    await downloadToFile(sourceUrl, inputPath);

    const handle = escapeDrawtext(ownerHandle(author));
    const brand = escapeDrawtext(APP_NAME);
    const filter = [
      `drawtext=text='${brand}':fontsize=28:fontcolor=white@0.95:box=1:boxcolor=0x00000088:boxborderw=8:x=w-tw-24:y=h-th-72`,
      `drawtext=text='@${handle}':fontsize=22:fontcolor=white@0.9:box=1:boxcolor=0x00000066:boxborderw=6:x=w-tw-24:y=h-th-32`,
    ].join(',');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters(filter)
        .outputOptions(['-c:a', 'copy', '-movflags', '+faststart'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const storagePath = `downloads/${reel.id}-${Date.now()}.mp4`;
    const body = await fs.readFile(outputPath);
    const { error } = await supabaseAdmin.storage
      .from('reels')
      .upload(storagePath, body, { contentType: 'video/mp4', upsert: true });
    if (error) throw new Error(error.message);

    const { data } = supabaseAdmin.storage.from('reels').getPublicUrl(storagePath);
    return { storagePath, publicUrl: data.publicUrl };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
