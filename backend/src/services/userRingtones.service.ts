import { chmodSync, existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { ensureStorageBucket } from '../lib/storageBuckets';

const RINGTONE_CLIP_SEC = 60;

let ffmpegReady = false;

function ensureFfmpeg(): string {
  const bin = ffmpegInstaller.path;
  if (!bin || !existsSync(bin)) {
    throw new Error('Ringtone processing is unavailable (ffmpeg missing on server)');
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

export type UserRingtoneRow = {
  id: string;
  user_id: string;
  label: string;
  audio_url: string;
  storage_path: string | null;
  duration_sec: number;
  created_at: string;
};

function runFfmpegTrim(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number
): Promise<void> {
  ensureFfmpeg();
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(Math.max(0, startSec))
      .setDuration(Math.min(RINGTONE_CLIP_SEC, Math.max(0.5, durationSec)))
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .noVideo()
      .format('mp3')
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(outputPath);
  });
}

/** Trim an uploaded source to ≤60s MP3 and store under the ringtones bucket. */
export async function createTrimmedRingtone(opts: {
  userId: string;
  label: string;
  sourcePath: string;
  startSec: number;
  endSec: number;
}): Promise<UserRingtoneRow> {
  const start = Math.max(0, opts.startSec);
  const end = Math.max(start + 0.5, Math.min(opts.endSec, start + RINGTONE_CLIP_SEC));
  const duration = end - start;

  await ensureStorageBucket('ringtones');
  await ensureStorageBucket('chat-files');

  const { data: srcBlob, error: dlErr } = await supabaseAdmin.storage
    .from('chat-files')
    .download(opts.sourcePath);
  if (dlErr || !srcBlob) {
    throw new Error(dlErr?.message || 'Could not load uploaded audio');
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ringtone-'));
  const inputPath = path.join(tmpDir, 'input.bin');
  const outputPath = path.join(tmpDir, 'clip.mp3');

  try {
    const buf = Buffer.from(await srcBlob.arrayBuffer());
    if (buf.byteLength < 64) throw new Error('Uploaded audio is empty');
    await fs.writeFile(inputPath, buf);
    await runFfmpegTrim(inputPath, outputPath, start, duration);

    const mp3 = await fs.readFile(outputPath);
    if (mp3.byteLength < 64) throw new Error('Trimmed ringtone came out empty');

    const storagePath = `users/${opts.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage.from('ringtones').upload(storagePath, mp3, {
      contentType: 'audio/mpeg',
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabaseAdmin.storage.from('ringtones').getPublicUrl(storagePath);
    const label = opts.label.trim().slice(0, 80) || 'Custom tone';

    const { data: row, error: insErr } = await supabaseAdmin
      .from('user_ringtones')
      .insert({
        user_id: opts.userId,
        label,
        audio_url: pub.publicUrl,
        storage_path: storagePath,
        duration_sec: Math.round(duration * 10) / 10,
      })
      .select('*')
      .single();

    if (insErr || !row) throw new Error(insErr?.message || 'Could not save ringtone');

    // Best-effort cleanup of the temporary source upload.
    await supabaseAdmin.storage.from('chat-files').remove([opts.sourcePath]).catch(() => undefined);

    return row as UserRingtoneRow;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function listUserRingtones(userId: string): Promise<UserRingtoneRow[]> {
  const { data, error } = await supabaseAdmin
    .from('user_ringtones')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as UserRingtoneRow[];
}

export async function deleteUserRingtone(userId: string, id: string): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from('user_ringtones')
    .select('id, storage_path')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!row) throw new Error('Ringtone not found');

  await supabaseAdmin
    .from('profiles')
    .update({ incoming_ringtone_id: null })
    .eq('user_id', userId)
    .eq('incoming_ringtone_id', id);

  const { error } = await supabaseAdmin
    .from('user_ringtones')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  if (row.storage_path) {
    await supabaseAdmin.storage.from('ringtones').remove([row.storage_path]).catch(() => undefined);
  }
}

export async function getSelectedRingtoneId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('incoming_ringtone_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.incoming_ringtone_id as string | null) ?? null;
}

export async function setSelectedRingtoneId(
  userId: string,
  ringtoneId: string | null
): Promise<UserRingtoneRow | null> {
  if (ringtoneId) {
    const { data: row } = await supabaseAdmin
      .from('user_ringtones')
      .select('*')
      .eq('id', ringtoneId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!row) throw new Error('Ringtone not found');

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ incoming_ringtone_id: ringtoneId })
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return row as UserRingtoneRow;
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ incoming_ringtone_id: null })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return null;
}
