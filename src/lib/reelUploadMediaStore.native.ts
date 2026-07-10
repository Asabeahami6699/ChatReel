import * as FileSystem from 'expo-file-system/legacy';
import type { ReelUploadDraft, ReelUploadMediaItem } from './reelUploadQueue';
import { REEL_PERSIST_URI_PREFIX, isPersistedReelUri } from './reelUploadMediaConstants';

export { REEL_PERSIST_URI_PREFIX, isPersistedReelUri };

const BASE_DIR = `${FileSystem.documentDirectory ?? ''}reel-upload-pending/`;

function taskDir(taskId: string): string {
  return `${BASE_DIR}${taskId}/`;
}

function mediaPath(taskId: string, index: number | 'thumb', ext: string): string {
  return `${taskDir(taskId)}${index}.${ext}`;
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

function inferExt(uri: string, fileName?: string, mime?: string): string {
  const fromName = (fileName || uri).split('?')[0].split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (mime?.includes('jpeg')) return 'jpg';
  if (mime?.includes('png')) return 'png';
  if (mime?.includes('quicktime')) return 'mov';
  if (mime?.includes('mp4')) return 'mp4';
  return 'mp4';
}

async function copyToPersist(
  taskId: string,
  index: number | 'thumb',
  uri: string,
  fileName?: string,
  mime?: string
): Promise<string> {
  await ensureDir(taskDir(taskId));
  const dest = mediaPath(taskId, index, inferExt(uri, fileName, mime));
  if (uri === dest) return dest;

  let from = uri;
  if (isPersistedReelUri(uri)) {
    const parts = uri.replace(REEL_PERSIST_URI_PREFIX, '').split('/');
    const srcTaskId = parts[0];
    const indexPart = parts[1];
    const srcIndex = indexPart === 'thumb' ? 'thumb' : Number(indexPart);
    const resolved = await resolveReelUploadUri(
      srcTaskId,
      srcIndex as number | 'thumb',
      inferExt(uri, fileName, mime)
    );
    if (!resolved) throw new Error('Saved upload data was cleared — cannot resume');
    from = resolved;
  }

  await FileSystem.copyAsync({ from, to: dest });
  return dest;
}

function draftItems(draft: ReelUploadDraft): ReelUploadMediaItem[] {
  if (draft.items?.length) return draft.items;
  if (draft.video) {
    return [
      {
        uri: draft.video.uri,
        fileName: draft.video.fileName,
        mime: draft.video.mime,
        mediaType: draft.video.mediaType === 'image' ? 'image' : 'video',
        width: draft.video.width,
        height: draft.video.height,
        duration: draft.video.duration,
        trimStartSec: draft.video.trimStartSec,
        trimEndSec: draft.video.trimEndSec,
      },
    ];
  }
  return [];
}

async function stashItem(
  taskId: string,
  index: number,
  item: ReelUploadMediaItem
): Promise<ReelUploadMediaItem> {
  const dest = await copyToPersist(taskId, index, item.uri, item.fileName, item.mime);
  return {
    ...item,
    uri: `${REEL_PERSIST_URI_PREFIX}${taskId}/${index}`,
    fileName: item.fileName ?? dest.split('/').pop(),
  };
}

export async function stashReelUploadDraft(
  taskId: string,
  draft: ReelUploadDraft
): Promise<ReelUploadDraft> {
  const items = draftItems(draft);
  const stashedItems = await Promise.all(items.map((item, i) => stashItem(taskId, i, item)));

  let thumbUri = draft.thumbUri;
  if (thumbUri && !isPersistedReelUri(thumbUri)) {
    await copyToPersist(taskId, 'thumb', thumbUri, 'thumb.jpg', 'image/jpeg');
    thumbUri = `${REEL_PERSIST_URI_PREFIX}${taskId}/thumb`;
  }

  if (draft.items?.length) {
    return { ...draft, items: stashedItems, thumbUri };
  }

  const first = stashedItems[0];
  if (!first) return draft;

  return {
    ...draft,
    thumbUri,
    video: {
      uri: first.uri,
      fileName: first.fileName,
      mime: first.mime,
      mediaType: first.mediaType,
      width: first.width,
      height: first.height,
      duration: first.duration,
      trimStartSec: first.trimStartSec,
      trimEndSec: first.trimEndSec,
    },
  };
}

export async function resolveReelUploadBlob(
  _taskId: string,
  _index: number | 'thumb'
): Promise<Blob | null> {
  return null;
}

export async function resolveReelUploadUri(
  taskId: string,
  index: number | 'thumb',
  ext = 'mp4'
): Promise<string | null> {
  const path = mediaPath(taskId, index, ext);
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? path : null;
}

export async function clearReelUploadMedia(taskId: string): Promise<void> {
  const dir = taskDir(taskId);
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
}

export async function hasReelUploadMedia(taskId: string): Promise<boolean> {
  const dir = taskDir(taskId);
  const info = await FileSystem.getInfoAsync(dir);
  return info.exists;
}
