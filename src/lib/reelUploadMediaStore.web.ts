import type { ReelUploadDraft, ReelUploadMediaItem } from './reelUploadQueue';
import { REEL_PERSIST_URI_PREFIX, isPersistedReelUri } from './reelUploadMediaConstants';

export { REEL_PERSIST_URI_PREFIX, isPersistedReelUri };

const DB_NAME = 'chatreel-reel-uploads';
const STORE = 'media';
const DB_VERSION = 1;

type StoredMedia = {
  blob: Blob;
  fileName?: string;
  mime?: string;
  mediaType: 'video' | 'image';
};

function mediaKey(taskId: string, index: number): string {
  return `${taskId}:${index}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut(key: string, value: StoredMedia): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(value, key);
      })
  );
}

function idbDeletePrefix(prefix: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          if (String(cursor.key).startsWith(prefix)) {
            cursor.delete();
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

async function uriToBlob(uri: string): Promise<Blob> {
  if (isPersistedReelUri(uri)) {
    const parts = uri.replace(REEL_PERSIST_URI_PREFIX, '').split('/');
    const taskId = parts[0];
    const indexPart = parts[1];
    const index = indexPart === 'thumb' ? 'thumb' : Number(indexPart);
    const blob = await resolveReelUploadBlob(taskId, index as number | 'thumb');
    if (!blob) throw new Error('Saved upload data was cleared — cannot resume');
    return blob;
  }
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Could not read media file');
  return res.blob();
}

async function stashItem(
  taskId: string,
  index: number,
  item: ReelUploadMediaItem
): Promise<ReelUploadMediaItem> {
  const blob = await uriToBlob(item.uri);
  await idbPut(mediaKey(taskId, index), {
    blob,
    fileName: item.fileName,
    mime: item.mime ?? blob.type,
    mediaType: item.mediaType,
  });
  return {
    ...item,
    uri: `${REEL_PERSIST_URI_PREFIX}${taskId}/${index}`,
  };
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

export async function stashReelUploadDraft(
  taskId: string,
  draft: ReelUploadDraft
): Promise<ReelUploadDraft> {
  const items = draftItems(draft);
  const stashedItems = await Promise.all(items.map((item, i) => stashItem(taskId, i, item)));

  let thumbUri = draft.thumbUri;
  if (thumbUri && !isPersistedReelUri(thumbUri)) {
    const thumbBlob = await uriToBlob(thumbUri);
    await idbPut(mediaKey(taskId, 'thumb'), {
      blob: thumbBlob,
      fileName: 'thumb.jpg',
      mime: 'image/jpeg',
      mediaType: 'image',
    });
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
  taskId: string,
  index: number | 'thumb'
): Promise<Blob | null> {
  const stored = await idbGet<StoredMedia>(mediaKey(taskId, index));
  return stored?.blob ?? null;
}

export async function clearReelUploadMedia(taskId: string): Promise<void> {
  await idbDeletePrefix(`${taskId}:`);
}

export async function hasReelUploadMedia(taskId: string): Promise<boolean> {
  const stored = await idbGet<StoredMedia>(mediaKey(taskId, 0));
  return Boolean(stored?.blob);
}

export async function resolveReelUploadUri(
  _taskId: string,
  _index: number | 'thumb',
  _ext?: string
): Promise<string | null> {
  return null;
}
