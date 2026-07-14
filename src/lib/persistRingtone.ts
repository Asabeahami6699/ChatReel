import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RINGTONE_DATA_KEY = 'chat_incoming_ringtone_data_v1';
/** Soft cap — AsyncStorage / IndexedDB stay healthy under a few MB. */
const MAX_BYTES = 3.5 * 1024 * 1024;

function guessMime(name?: string | null, fallback = 'audio/mpeg'): string {
  const n = (name ?? '').toLowerCase();
  if (n.endsWith('.wav')) return 'audio/wav';
  if (n.endsWith('.m4a') || n.endsWith('.mp4') || n.endsWith('.aac')) return 'audio/mp4';
  if (n.endsWith('.ogg')) return 'audio/ogg';
  if (n.endsWith('.mp3')) return 'audio/mpeg';
  return fallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Prefer browser btoa; build binary string in chunks to avoid stack overflows.
  if (typeof btoa === 'function') {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      let part = '';
      for (let j = 0; j < slice.length; j++) part += String.fromCharCode(slice[j]!);
      binary += part;
    }
    return btoa(binary);
  }
  // Native fallback via Buffer when available.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require('buffer') as typeof import('buffer');
  return Buffer.from(bytes).toString('base64');
}

/**
 * Turn a picker URI (often blob: on web) into a durable ringtone URI.
 * Web → data: URI persisted for playback across reloads.
 * Native → copy into app document directory.
 */
export async function persistIncomingRingtoneSource(input: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}): Promise<string> {
  const { uri, name, mimeType } = input;

  if (Platform.OS !== 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
      const base = FileSystem.documentDirectory;
      if (base) {
        const ext =
          (name && /\.[a-z0-9]+$/i.test(name) ? name.match(/\.[a-z0-9]+$/i)?.[0] : null) ||
          '.mp3';
        const dest = `${base}incoming-ringtone${ext}`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        return dest;
      }
    } catch (err) {
      console.warn('[ringtone] native persist failed, using picker uri', err);
    }
    return uri;
  }

  // Web: materialize blob/file into a data URI so it survives refresh.
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    if (blob.size > MAX_BYTES) {
      throw new Error('Ringtone file is too large. Pick a shorter clip (under ~3MB).');
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    const mime = guessMime(name, mimeType || blob.type || 'audio/mpeg');
    const dataUri = `data:${mime};base64,${bytesToBase64(buf)}`;
    // Keep a side copy for recovery if settings get trimmed oddly.
    try {
      await AsyncStorage.setItem(RINGTONE_DATA_KEY, dataUri);
    } catch {
      /* still return dataUri for this session */
    }
    return dataUri;
  } catch (err) {
    if (err instanceof Error && err.message.includes('too large')) throw err;
    console.warn('[ringtone] web persist failed', err);
    throw new Error('Could not save ringtone. Try a smaller MP3/M4A file.');
  }
}

export async function clearPersistedRingtoneBlob(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RINGTONE_DATA_KEY);
  } catch {
    /* ignore */
  }
}

/** Recover a data URI after settings load if only the label survived. */
export async function loadPersistedRingtoneBlob(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(RINGTONE_DATA_KEY))?.trim() || null;
  } catch {
    return null;
  }
}
