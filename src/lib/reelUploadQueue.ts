import { api, type ReelDTO } from './api';
import { uploadReelImage, uploadReelThumbnail, uploadReelVideo } from './reelUploader';
import { isImageMime } from './reelPlayback';
import { probeVideoDimensions } from './videoDimensions';
import { notifyRealtimeTopic } from './realtimeHub';
import { invalidateReelsFeedCache } from './reelsFeedPrefetch';
import { loadReelUploadState, saveReelUploadState } from './reelUploadPersistence';
import {
  clearReelUploadMedia,
  hasReelUploadMedia,
  stashReelUploadDraft,
} from './reelUploadMediaStore';
import { saveReelComposeDraft } from './reelComposeDraftStore';

/** Default display length for photo reels with music (seconds). */
const IMAGE_REEL_CLIP_SEC = 15;

export type ReelUploadVisibility = 'public' | 'friends' | 'private' | 'group';

export type ReelUploadMediaItem = {
  uri: string;
  fileName?: string;
  mime?: string;
  mediaType: 'video' | 'image';
  width?: number;
  height?: number;
  duration?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  thumbUri?: string | null;
};

export type ReelUploadDraft = {
  video?: {
    uri: string;
    fileName?: string;
    mime?: string;
    mediaType?: 'video' | 'image';
    width?: number;
    height?: number;
    duration?: number;
    trimStartSec?: number;
    trimEndSec?: number;
  };
  items?: ReelUploadMediaItem[];
  thumbUri?: string | null;
  caption?: string;
  visibility: ReelUploadVisibility;
  group_id?: string;
  sound_id?: string;
  sound_start_sec?: number;
  original_audio_volume?: number;
  sound_volume?: number;
  scheduled_publish_at?: string;
};

export type ReelUploadStatus = 'queued' | 'uploading' | 'publishing' | 'done' | 'error';

export type ReelUploadCheckpoint = {
  videoStoragePath?: string;
  videoPublicUrl?: string;
  thumbnailPublicUrl?: string;
  reelId?: string;
};

export type ReelUploadTask = {
  id: string;
  status: ReelUploadStatus;
  stage: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
  reelId?: string;
  resumable?: boolean;
  /** How many times the user has manually retried this upload. */
  retryCount?: number;
};

/** After this many manual retries, failed uploads are moved to drafts. */
export const MAX_UPLOAD_RETRIES = 3;

export type RetryUploadResult =
  | { ok: true; action: 'retried'; retriesLeft: number }
  | { ok: true; action: 'moved_to_draft'; label: string }
  | { ok: false; reason: string };

type Listener = (tasks: ReelUploadTask[]) => void;
type DraftMoveListener = (info: { label: string }) => void;

const tasks = new Map<string, ReelUploadTask>();
const taskDrafts = new Map<string, ReelUploadDraft>();
const checkpoints = new Map<string, ReelUploadCheckpoint>();
const queue: Array<{ id: string; draft: ReelUploadDraft }> = [];
const listeners = new Set<Listener>();
const draftMoveListeners = new Set<DraftMoveListener>();

function soundPublishFields(draft: ReelUploadDraft) {
  if (!draft.sound_id) return {};
  return {
    sound_id: draft.sound_id,
    sound_start_sec: draft.sound_start_sec ?? 0,
    original_audio_volume: draft.original_audio_volume ?? 1,
    sound_volume: draft.sound_volume ?? 0.45,
  };
}

function schedulePublishFields(draft: ReelUploadDraft) {
  if (!draft.scheduled_publish_at) return {};
  return { scheduled_publish_at: draft.scheduled_publish_at };
}

const MAX_PARALLEL_UPLOADS = 3;
let activeUploads = 0;
let initPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  const list = Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  listeners.forEach((listener) => listener(list));
  schedulePersist();
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistQueueNow();
  }, 400);
}

async function persistQueueNow() {
  const snapshot: Parameters<typeof saveReelUploadState>[0] = {
    tasks: Array.from(tasks.values()),
    drafts: Object.fromEntries(taskDrafts.entries()),
    checkpoints: Object.fromEntries(checkpoints.entries()),
  };
  await saveReelUploadState(snapshot);
}

function setCheckpoint(id: string, patch: Partial<ReelUploadCheckpoint>) {
  const existing = checkpoints.get(id) ?? {};
  checkpoints.set(id, { ...existing, ...patch });
  schedulePersist();
}

function updateTask(id: string, patch: Partial<ReelUploadTask>) {
  const existing = tasks.get(id);
  if (!existing) return;
  tasks.set(id, { ...existing, ...patch, updatedAt: Date.now() });
  emit();
}

function setProgress(id: string, progress: number, stage?: string) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  updateTask(id, {
    progress: clamped,
    ...(stage ? { stage } : {}),
  });
}

const MODERATION_POLL_MS = 2000;
const MODERATION_TIMEOUT_MS = 90_000;

async function waitForReelModeration(
  reelId: string,
  onStage: (stage: string) => void
): Promise<'approved' | 'rejected' | 'flagged' | 'pending'> {
  const deadline = Date.now() + MODERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { reel } = await api.reels.get(reelId);
    const status = reel.moderation_status ?? 'pending';
    if (status === 'approved') return 'approved';
    if (status === 'rejected') return 'rejected';
    if (status === 'flagged') return 'flagged';
    onStage('Reviewing content...');
    await new Promise((resolve) => setTimeout(resolve, MODERATION_POLL_MS));
  }
  return 'pending';
}

async function finalizePublishedReel(id: string, reelId: string) {
  setCheckpoint(id, { reelId });
  setProgress(id, 92, 'Reviewing content...');
  updateTask(id, { status: 'publishing', stage: 'Reviewing content...', reelId });
  const mod = await waitForReelModeration(reelId, (stage) => setProgress(id, 94, stage));
  if (mod === 'rejected') {
    throw new Error('This reel did not meet our community guidelines.');
  }
  // Drop stale feed cache so soft-inject / local realtime picks up the approved reel.
  invalidateReelsFeedCache();
  notifyRealtimeTopic('reels');
  updateTask(id, {
    status: 'done',
    stage:
      mod === 'approved'
        ? 'Posted'
        : mod === 'flagged'
          ? 'Posted — under review'
          : 'Under review',
    progress: 100,
    reelId,
  });
  await clearReelUploadMedia(id);
  checkpoints.delete(id);
  taskDrafts.delete(id);
  await persistQueueNow();
}

function createTask(): ReelUploadTask {
  const id = `reel-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    status: 'queued',
    stage: 'Queued',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    resumable: true,
  };
}

function pumpWorkers() {
  while (activeUploads < MAX_PARALLEL_UPLOADS && queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    activeUploads += 1;
    void processOne(item)
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : 'Upload failed';
        const existing = tasks.get(item.id);
        const retries = existing?.retryCount ?? 0;
        updateTask(item.id, {
          status: 'error',
          stage: 'Failed',
          error: message,
        });
        if (retries >= MAX_UPLOAD_RETRIES) {
          try {
            await moveFailedUploadToDraft(item.id);
          } catch {
            /* keep failed upload in queue if draft save fails */
          }
        }
      })
      .finally(() => {
        activeUploads -= 1;
        pumpWorkers();
      });
  }
}

function pendingVideoPath(taskId: string, ext: string): string {
  return `pending/${taskId}/video.${ext}`;
}

function pendingThumbPath(taskId: string): string {
  return `pending/${taskId}/thumb.jpg`;
}

async function processOne(item: { id: string; draft: ReelUploadDraft }) {
  const { id, draft } = item;
  const checkpoint = checkpoints.get(id) ?? {};
  const { caption, visibility, group_id: groupId } = draft;
  const publishVisibility =
    visibility === 'group' && groupId
      ? { visibility: 'group' as const, group_id: groupId }
      : { visibility };

  if (checkpoint.reelId) {
    await finalizePublishedReel(id, checkpoint.reelId);
    return;
  }

  if (draft.items && draft.items.length > 1) {
    await processCarouselUpload(id, draft);
    return;
  }

  const single = draft.items?.[0];
  const video = single
    ? {
        uri: single.uri,
        fileName: single.fileName,
        mime: single.mime,
        mediaType: single.mediaType,
        width: single.width,
        height: single.height,
        duration: single.duration,
        trimStartSec: single.trimStartSec,
        trimEndSec: single.trimEndSec,
      }
    : draft.video;
  const thumbUri = single?.thumbUri ?? draft.thumbUri;

  if (!video) throw new Error('No media to upload');

  const isImage = video.mediaType === 'image' || isImageMime(video.mime);

  setProgress(id, checkpoint.videoPublicUrl ? 78 : 2, 'Preparing...');

  if (isImage) {
    updateTask(id, { status: 'uploading', stage: 'Uploading photo...', progress: 5 });
    const imageExt = 'jpg';
    const imageUrl =
      checkpoint.videoPublicUrl ??
      (await uploadReelImage({
        uri: video.uri,
        fileName: video.fileName,
        contentType: video.mime,
        storagePath: `pending/${id}/image.${imageExt}`,
        upsert: true,
        onProgress: (loaded, total) => {
          if (total > 0) setProgress(id, 5 + (loaded / total) * 80, 'Uploading photo...');
        },
      }));
    if (!checkpoint.videoPublicUrl) {
      setCheckpoint(id, { videoPublicUrl: imageUrl });
    }

    setProgress(id, 90, 'Publishing reel...');
    updateTask(id, { status: 'publishing' });

    const { reel }: { reel: ReelDTO } = await api.reels.create({
      video_url: imageUrl,
      thumbnail_url: imageUrl,
      caption: caption?.trim() || undefined,
      duration: IMAGE_REEL_CLIP_SEC,
      media: [
        {
          media_url: imageUrl,
          media_type: 'image',
          thumbnail_url: imageUrl,
          width: video.width,
          height: video.height,
        },
      ],
      ...publishVisibility,
      ...soundPublishFields(draft),
      ...schedulePublishFields(draft),
      width: video.width,
      height: video.height,
    });

    await finalizePublishedReel(id, reel.id);
    return;
  }

  let width = video.width;
  let height = video.height;
  let duration = video.duration;
  const ext = (video.fileName || video.uri).split('.').pop()?.toLowerCase() || 'mp4';
  const videoStoragePath = checkpoint.videoStoragePath ?? pendingVideoPath(id, ext);

  updateTask(id, {
    status: 'uploading',
    stage: checkpoint.videoPublicUrl ? 'Resuming upload...' : 'Uploading video...',
    progress: checkpoint.videoPublicUrl ? 75 : 5,
  });

  const needsProbe = !width || !height || !duration;
  const probePromise = needsProbe
    ? probeVideoDimensions(video.uri).catch(() => null)
    : Promise.resolve(null);

  let videoUrl = checkpoint.videoPublicUrl;
  if (!videoUrl) {
    const uploadPromise = uploadReelVideo({
      uri: video.uri,
      fileName: video.fileName,
      contentType: video.mime,
      storagePath: videoStoragePath,
      upsert: true,
      onProgress: (loaded, total) => {
        if (total > 0) {
          const pct = 5 + (loaded / total) * 70;
          setProgress(id, pct, 'Uploading video...');
        }
      },
    });

    const thumbPromise = thumbUri
      ? checkpoint.thumbnailPublicUrl
        ? Promise.resolve(checkpoint.thumbnailPublicUrl)
        : uploadReelThumbnail({
            uri: thumbUri,
            storagePath: pendingThumbPath(id),
            upsert: true,
          }).catch(() => undefined)
      : Promise.resolve<string | undefined>(checkpoint.thumbnailPublicUrl);

    const [probed, uploadedVideoUrl, thumbnailUrl] = await Promise.all([
      probePromise,
      uploadPromise,
      thumbPromise,
    ]);

    videoUrl = uploadedVideoUrl;
    setCheckpoint(id, {
      videoStoragePath,
      videoPublicUrl: videoUrl,
      ...(thumbnailUrl ? { thumbnailPublicUrl: thumbnailUrl } : {}),
    });

    width = width ?? probed?.width;
    height = height ?? probed?.height;
    duration = duration ?? probed?.duration;
  } else {
    const probed = await probePromise;
    width = width ?? probed?.width;
    height = height ?? probed?.height;
    duration = duration ?? probed?.duration;

    if (thumbUri && !checkpoint.thumbnailPublicUrl) {
      const thumbnailUrl = await uploadReelThumbnail({
        uri: thumbUri,
        storagePath: pendingThumbPath(id),
        upsert: true,
      }).catch(() => undefined);
      if (thumbnailUrl) {
        setCheckpoint(id, { thumbnailPublicUrl: thumbnailUrl });
      }
    }
  }

  const thumbnailUrl = checkpoints.get(id)?.thumbnailPublicUrl;

  const trimStartSec = video.trimStartSec ?? 0;
  const trimEndSec =
    video.trimEndSec ?? (typeof duration === 'number' ? duration : undefined);

  setProgress(id, 90, 'Publishing reel...');
  updateTask(id, { status: 'publishing' });

  const safeDuration =
    typeof duration === 'number' && duration >= 0.5 ? duration : undefined;
  const effectiveDuration =
    trimEndSec != null && trimStartSec < trimEndSec
      ? trimEndSec - trimStartSec
      : safeDuration;

  const { reel }: { reel: ReelDTO } = await api.reels.create({
    video_url: videoUrl!,
    thumbnail_url: thumbnailUrl,
    caption: caption?.trim() || undefined,
    duration: effectiveDuration,
    ...publishVisibility,
    ...soundPublishFields(draft),
    ...schedulePublishFields(draft),
    width,
    height,
    trim_start_sec: trimStartSec > 0 ? trimStartSec : undefined,
    trim_end_sec:
      trimEndSec != null && duration != null && trimEndSec < duration - 0.05
        ? trimEndSec
        : undefined,
  });

  await finalizePublishedReel(id, reel.id);
}

async function processCarouselUpload(id: string, draft: ReelUploadDraft) {
  const items = draft.items!;
  const publishVisibility =
    draft.visibility === 'group' && draft.group_id
      ? { visibility: 'group' as const, group_id: draft.group_id }
      : { visibility: draft.visibility };
  const total = items.length;

  setProgress(id, 2, `Uploading 0/${total}...`);
  updateTask(id, { status: 'uploading' });

  const uploaded = await Promise.all(
    items.map(async (media, i) => {
      const isImage = media.mediaType === 'image' || isImageMime(media.mime);
      const basePct = 5 + (i / total) * 80;
      const span = 80 / total;
      const storagePath = `pending/${id}/media-${i}.${isImage ? 'jpg' : 'mp4'}`;

      if (isImage) {
        const imageUrl = await uploadReelImage({
          uri: media.uri,
          fileName: media.fileName,
          contentType: media.mime,
          storagePath,
          upsert: true,
          onProgress: (loaded, totalBytes) => {
            if (totalBytes > 0) {
              setProgress(id, basePct + (loaded / totalBytes) * span, `Uploading photo ${i + 1}/${total}...`);
            }
          },
        });
        return {
          media_url: imageUrl,
          media_type: 'image' as const,
          thumbnail_url: imageUrl,
          width: media.width,
          height: media.height,
        };
      }

      const [probed, videoUrl, thumbnailUrl] = await Promise.all([
        !media.width || !media.height || !media.duration
          ? probeVideoDimensions(media.uri).catch(() => null)
          : Promise.resolve(null),
        uploadReelVideo({
          uri: media.uri,
          fileName: media.fileName,
          contentType: media.mime,
          storagePath,
          upsert: true,
          onProgress: (loaded, totalBytes) => {
            if (totalBytes > 0) {
              setProgress(id, basePct + (loaded / totalBytes) * span, `Uploading video ${i + 1}/${total}...`);
            }
          },
        }),
        media.thumbUri
          ? uploadReelThumbnail({
              uri: media.thumbUri,
              storagePath: `pending/${id}/thumb-${i}.jpg`,
              upsert: true,
            }).catch(() => undefined)
          : Promise.resolve<string | undefined>(undefined),
      ]);

      const width = media.width ?? probed?.width;
      const height = media.height ?? probed?.height;
      const duration = media.duration ?? probed?.duration;
      const trimStartSec = media.trimStartSec ?? 0;
      const trimEndSec = media.trimEndSec ?? (typeof duration === 'number' ? duration : undefined);
      const safeDuration = typeof duration === 'number' && duration >= 0.5 ? duration : undefined;
      const effectiveDuration =
        trimEndSec != null && trimStartSec < trimEndSec
          ? trimEndSec - trimStartSec
          : safeDuration;

      return {
        media_url: videoUrl,
        media_type: 'video' as const,
        thumbnail_url: thumbnailUrl,
        duration: effectiveDuration,
        width,
        height,
        trim_start_sec: trimStartSec > 0 ? trimStartSec : undefined,
        trim_end_sec:
          trimEndSec != null && duration != null && trimEndSec < duration - 0.05
            ? trimEndSec
            : undefined,
      };
    })
  );

  setProgress(id, 90, 'Publishing reel...');
  updateTask(id, { status: 'publishing' });

  const { reel }: { reel: ReelDTO } = await api.reels.create({
    caption: draft.caption?.trim() || undefined,
    ...publishVisibility,
    ...soundPublishFields(draft),
    ...schedulePublishFields(draft),
    media: uploaded,
  });

  await finalizePublishedReel(id, reel.id);
}

export async function enqueueReelUpload(draft: ReelUploadDraft): Promise<ReelUploadTask> {
  await initReelUploadQueue();
  const task = createTask();
  tasks.set(task.id, task);
  const persistentDraft = await stashReelUploadDraft(task.id, draft);
  taskDrafts.set(task.id, persistentDraft);
  queue.push({ id: task.id, draft: persistentDraft });
  emit();
  pumpWorkers();
  return task;
}

async function removeUploadTask(taskId: string, clearMedia: boolean): Promise<void> {
  tasks.delete(taskId);
  taskDrafts.delete(taskId);
  checkpoints.delete(taskId);
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (queue[i].id === taskId) queue.splice(i, 1);
  }
  if (clearMedia) {
    await clearReelUploadMedia(taskId);
  }
  await persistQueueNow();
  emit();
}

/** Save a failed upload as a compose draft and remove it from the upload queue. */
export async function moveFailedUploadToDraft(taskId: string): Promise<RetryUploadResult> {
  const task = tasks.get(taskId);
  const draft = taskDrafts.get(taskId);
  if (!task || !draft) {
    return { ok: false, reason: 'Upload not found' };
  }

  const label =
    draft.caption?.trim()?.slice(0, 40) ||
    `Failed upload · ${new Date().toLocaleString()}`;
  const saved = await saveReelComposeDraft(draft, label);

  // Keep persisted media keyed by the old task id — draft URIs still point there.
  await removeUploadTask(taskId, false);
  draftMoveListeners.forEach((listener) => listener({ label: saved.label }));

  return { ok: true, action: 'moved_to_draft', label: saved.label };
}

export async function retryReelUploadTask(taskId: string): Promise<RetryUploadResult> {
  const task = tasks.get(taskId);
  const draft = taskDrafts.get(taskId);
  if (!task || !draft) return { ok: false, reason: 'Upload not found' };
  if (task.status !== 'error') return { ok: false, reason: 'Upload is not failed' };

  const retries = task.retryCount ?? 0;
  if (retries >= MAX_UPLOAD_RETRIES) {
    return moveFailedUploadToDraft(taskId);
  }

  const nextRetries = retries + 1;
  const checkpoint = checkpoints.get(taskId);
  updateTask(taskId, {
    status: 'queued',
    stage: checkpoint?.videoPublicUrl ? 'Resuming upload...' : 'Queued for retry',
    progress: checkpoint?.videoPublicUrl ? 75 : checkpoint?.reelId ? 92 : 0,
    error: undefined,
    retryCount: nextRetries,
  });
  queue.push({ id: taskId, draft });
  emit();
  pumpWorkers();
  return {
    ok: true,
    action: 'retried',
    retriesLeft: Math.max(0, MAX_UPLOAD_RETRIES - nextRetries),
  };
}

export function subscribeReelUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt));
  return () => listeners.delete(listener);
}

export function subscribeFailedUploadMovedToDraft(listener: DraftMoveListener): () => void {
  draftMoveListeners.add(listener);
  return () => draftMoveListeners.delete(listener);
}

export function getReelUploadQueueSnapshot(): ReelUploadTask[] {
  return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

async function resumePersistedTasks() {
  const state = await loadReelUploadState();
  if (!state) return;

  for (const task of state.tasks) {
    if (task.status === 'done') continue;

    const draft = state.drafts[task.id];
    if (!draft) continue;

    const mediaOk = await hasReelUploadMedia(task.id);
    if (!mediaOk && !state.checkpoints[task.id]?.videoPublicUrl) {
      tasks.set(task.id, {
        ...task,
        status: 'error',
        stage: 'Failed',
        error: 'Upload data was cleared — cannot resume',
        progress: 0,
        updatedAt: Date.now(),
      });
      continue;
    }

    const cp = state.checkpoints[task.id];
    tasks.set(task.id, {
      ...task,
      status: 'queued',
      stage: cp?.reelId
        ? 'Resuming publish...'
        : cp?.videoPublicUrl
          ? 'Resuming upload...'
          : 'Queued',
      progress: cp?.reelId ? 92 : cp?.videoPublicUrl ? 75 : task.progress ?? 0,
      error: undefined,
      updatedAt: Date.now(),
    });
    taskDrafts.set(task.id, draft);
    if (state.checkpoints[task.id]) {
      checkpoints.set(task.id, state.checkpoints[task.id]);
    }
    queue.push({ id: task.id, draft });
  }

  emit();
  pumpWorkers();
}

export function initReelUploadQueue(): Promise<void> {
  if (!initPromise) {
    initPromise = resumePersistedTasks();
  }
  return initPromise;
}
