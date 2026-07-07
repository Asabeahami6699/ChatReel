import type { ReelUploadDraft } from './reelUploadQueue';

export { REEL_PERSIST_URI_PREFIX, isPersistedReelUri } from './reelUploadMediaConstants';

export async function stashReelUploadDraft(
  taskId: string,
  draft: ReelUploadDraft
): Promise<ReelUploadDraft> {
  return draft;
}

export async function resolveReelUploadBlob(
  _taskId: string,
  _index: number
): Promise<Blob | null> {
  return null;
}

export async function clearReelUploadMedia(_taskId: string): Promise<void> {}

export async function hasReelUploadMedia(_taskId: string): Promise<boolean> {
  return false;
}

export async function resolveReelUploadUri(
  _taskId: string,
  _index: number | 'thumb',
  _ext?: string
): Promise<string | null> {
  return null;
}
