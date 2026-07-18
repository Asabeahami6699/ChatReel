/**
 * On-device ChatReel media layout (app Documents sandbox):
 *
 *   ChatReel/
 *     Images/{chatId}/{clientMessageId}.jpg
 *     Videos/{chatId}/{clientMessageId}.mp4
 *     Audio/{chatId}/{clientMessageId}.m4a
 *     Files/{chatId}/{clientMessageId}.pdf
 *
 * Android: …/files/ChatReel/…
 * iOS:     …/Documents/ChatReel/…
 *
 * These are app-private (survive restarts). They are not the public Photos
 * gallery unless you separately export via MediaLibrary.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export type ChatMediaKind = 'image' | 'video' | 'audio' | 'file';

const ROOT_NAME = 'ChatReel';

const FOLDER: Record<ChatMediaKind, string> = {
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  file: 'Files',
};

function baseRoot(): string | null {
  if (Platform.OS === 'web') return null;
  const doc = FileSystem.documentDirectory;
  if (!doc) return null;
  return `${doc}${ROOT_NAME}/`;
}

function kindFromMessageType(
  messageType?: string | null,
  mime?: string | null
): ChatMediaKind {
  if (messageType === 'image') return 'image';
  if (messageType === 'video') return 'video';
  if (messageType === 'audio') return 'audio';
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'file';
}

function inferExt(uri: string, fileName?: string | null, mime?: string | null): string {
  const fromName = (fileName || uri).split('?')[0].split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return 'jpg';
  if (mime?.includes('png')) return 'png';
  if (mime?.includes('webp')) return 'webp';
  if (mime?.includes('gif')) return 'gif';
  if (mime?.includes('mp4')) return 'mp4';
  if (mime?.includes('quicktime')) return 'mov';
  if (mime?.includes('webm')) return 'webm';
  if (mime?.includes('m4a') || mime?.includes('mp4a')) return 'm4a';
  if (mime?.includes('mpeg') || mime?.includes('mp3')) return 'mp3';
  if (mime?.includes('pdf')) return 'pdf';
  return 'bin';
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

/** Absolute ChatReel root, e.g. file:///…/Documents/ChatReel/ */
export function getChatReelRoot(): string | null {
  return baseRoot();
}

export async function ensureChatReelTree(): Promise<string | null> {
  const root = baseRoot();
  if (!root) return null;
  await ensureDir(root);
  for (const folder of Object.values(FOLDER)) {
    await ensureDir(`${root}${folder}/`);
  }
  return root;
}

export function chatMediaRelativePath(
  kind: ChatMediaKind,
  chatId: string,
  clientMessageId: string,
  ext: string
): string {
  const safeChat = chatId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const safeId = clientMessageId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const safeExt = ext.replace(/[^a-z0-9]/gi, '') || 'bin';
  return `${FOLDER[kind]}/${safeChat}/${safeId}.${safeExt}`;
}

export function chatMediaAbsolutePath(
  kind: ChatMediaKind,
  chatId: string,
  clientMessageId: string,
  ext: string
): string | null {
  const root = baseRoot();
  if (!root) return null;
  return `${root}${chatMediaRelativePath(kind, chatId, clientMessageId, ext)}`;
}

/**
 * Copy a local picker/recorder URI into ChatReel/{Images|Videos|Audio|Files}/…
 * Returns the persisted file:// URI (or the original URI on web / failure).
 */
export async function persistChatMedia(opts: {
  chatId: string;
  clientMessageId: string;
  fromUri: string;
  messageType?: string | null;
  fileName?: string | null;
  mime?: string | null;
}): Promise<string> {
  const { chatId, clientMessageId, fromUri, messageType, fileName, mime } = opts;
  if (Platform.OS === 'web' || !fromUri) return fromUri;
  if (fromUri.startsWith('http://') || fromUri.startsWith('https://')) return fromUri;
  if (fromUri.startsWith('blob:')) return fromUri;

  try {
    const root = await ensureChatReelTree();
    if (!root) return fromUri;

    const kind = kindFromMessageType(messageType, mime);
    const ext = inferExt(fromUri, fileName, mime);
    const dest = chatMediaAbsolutePath(kind, chatId, clientMessageId, ext);
    if (!dest) return fromUri;

    const chatDir = dest.slice(0, dest.lastIndexOf('/') + 1);
    await ensureDir(chatDir);

    if (fromUri === dest) return dest;

    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists) return dest;

    await FileSystem.copyAsync({ from: fromUri, to: dest });
    return dest;
  } catch (err) {
    console.warn('[chatMediaStore] persist failed:', err);
    return fromUri;
  }
}

/**
 * Download a remote chat media URL into ChatReel folders for offline viewing.
 * No-ops if already cached.
 */
export async function cacheRemoteChatMedia(opts: {
  chatId: string;
  clientMessageId: string;
  remoteUrl: string;
  messageType?: string | null;
  fileName?: string | null;
  mime?: string | null;
}): Promise<string | null> {
  const { chatId, clientMessageId, remoteUrl, messageType, fileName, mime } = opts;
  if (Platform.OS === 'web' || !remoteUrl) return null;
  if (!/^https?:\/\//i.test(remoteUrl)) return null;

  try {
    const root = await ensureChatReelTree();
    if (!root) return null;

    const kind = kindFromMessageType(messageType, mime);
    const ext = inferExt(remoteUrl, fileName, mime);
    const dest = chatMediaAbsolutePath(kind, chatId, clientMessageId, ext);
    if (!dest) return null;

    const chatDir = dest.slice(0, dest.lastIndexOf('/') + 1);
    await ensureDir(chatDir);

    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists) return dest;

    const result = await FileSystem.downloadAsync(remoteUrl.split('?')[0], dest);
    return result.uri ?? dest;
  } catch (err) {
    console.warn('[chatMediaStore] cache remote failed:', err);
    return null;
  }
}

export async function deleteChatMedia(
  kind: ChatMediaKind,
  chatId: string,
  clientMessageId: string,
  ext: string
): Promise<void> {
  const path = chatMediaAbsolutePath(kind, chatId, clientMessageId, ext);
  if (!path) return;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ignore */
  }
}
