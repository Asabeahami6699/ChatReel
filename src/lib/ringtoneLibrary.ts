import { api, type UserRingtoneDTO } from './api';
import { uploadFromUri } from './uploads';

export function guessAudioContentType(name?: string | null, mime?: string | null): string {
  if (mime && mime.startsWith('audio/')) return mime;
  const n = (name ?? '').toLowerCase();
  if (n.endsWith('.wav')) return 'audio/wav';
  if (n.endsWith('.m4a') || n.endsWith('.mp4') || n.endsWith('.aac')) return 'audio/mp4';
  if (n.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/mpeg';
}

/** Upload full picked audio as a temp source, then server trims to ≤60s MP3. */
export async function saveRingtoneClip(opts: {
  userId: string;
  localUri: string;
  label: string;
  name?: string | null;
  mimeType?: string | null;
  startSec: number;
  endSec: number;
}): Promise<UserRingtoneDTO> {
  const ext =
    (opts.name && /\.[a-z0-9]+$/i.test(opts.name)
      ? opts.name.match(/\.[a-z0-9]+$/i)?.[0]
      : null) || '.mp3';
  const sourcePath = `ringtones-src/${opts.userId}/${Date.now()}${ext}`;
  await uploadFromUri(
    'chat-files',
    sourcePath,
    opts.localUri,
    guessAudioContentType(opts.name, opts.mimeType)
  );

  const { ringtone } = await api.ringtones.create({
    label: opts.label,
    source_path: sourcePath,
    start_sec: opts.startSec,
    end_sec: Math.min(opts.endSec, opts.startSec + 60),
  });
  return ringtone;
}

export type { UserRingtoneDTO };
