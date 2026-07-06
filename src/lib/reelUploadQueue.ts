import { api, type ReelDTO } from './api';
import { uploadReelImage, uploadReelThumbnail, uploadReelVideo } from './reelUploader';
import { isImageMime } from './reelPlayback';
import { probeVideoDimensions } from './videoDimensions';
import { notifyRealtimeTopic } from './realtimeHub';

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
};

export type ReelUploadStatus = 'queued' | 'uploading' | 'publishing' | 'done' | 'error';

export type ReelUploadTask = {
  id: string;
  status: ReelUploadStatus;
  stage: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
  reelId?: string;
};

type Listener = (tasks: ReelUploadTask[]) => void;

const tasks = new Map<string, ReelUploadTask>();
const taskDrafts = new Map<string, ReelUploadDraft>();
const queue: Array<{ id: string; draft: ReelUploadDraft }> = [];
const listeners = new Set<Listener>();
/** Run multiple reel uploads in parallel — no waiting for the previous post to finish. */

function soundPublishFields(draft: ReelUploadDraft) {
  if (!draft.sound_id) return {};
  return {
    sound_id: draft.sound_id,
    sound_start_sec: draft.sound_start_sec ?? 0,
    original_audio_volume: draft.original_audio_volume ?? 0,
  };
}
const MAX_PARALLEL_UPLOADS = 3;
let activeUploads = 0;

function emit() {
  const list = Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  listeners.forEach((listener) => listener(list));
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
  setProgress(id, 92, 'Reviewing content...');
  updateTask(id, { status: 'publishing', stage: 'Reviewing content...' });
  const mod = await waitForReelModeration(reelId, (stage) => setProgress(id, 94, stage));
  if (mod === 'rejected') {
    throw new Error('This reel did not meet our community guidelines.');
  }
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
  };
}

function pumpWorkers() {
  while (activeUploads < MAX_PARALLEL_UPLOADS && queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    activeUploads += 1;
    void processOne(item)
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Upload failed';
        updateTask(item.id, {
          status: 'error',
          stage: 'Failed',
          progress: 0,
          error: message,
        });
      })
      .finally(() => {
        activeUploads -= 1;
        pumpWorkers();
      });
  }
}

async function processOne(item: { id: string; draft: ReelUploadDraft }) {
  const { id, draft } = item;
  const { caption, visibility, group_id: groupId } = draft;
  const publishVisibility =
    visibility === 'group' && groupId
      ? { visibility: 'group' as const, group_id: groupId }
      : { visibility };

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

  setProgress(id, 2, 'Preparing...');

  if (isImage) {
    updateTask(id, { status: 'uploading', stage: 'Uploading photo...', progress: 5 });
    const imageUrl = await uploadReelImage({
      uri: video.uri,
      fileName: video.fileName,
      contentType: video.mime,
      onProgress: (loaded, total) => {
        if (total > 0) setProgress(id, 5 + (loaded / total) * 80, 'Uploading photo...');
      },
    });

    setProgress(id, 90, 'Publishing reel...');
    updateTask(id, { status: 'publishing' });

    const { reel }: { reel: ReelDTO } = await api.reels.create({
      video_url: imageUrl,
      thumbnail_url: imageUrl,
      caption: caption?.trim() || undefined,
      duration: IMAGE_REEL_CLIP_SEC,
      ...publishVisibility,
      ...soundPublishFields(draft),
      width: video.width,
      height: video.height,
    });

    await finalizePublishedReel(id, reel.id);
    return;
  }

  let width = video.width;
  let height = video.height;
  let duration = video.duration;

  updateTask(id, { status: 'uploading', stage: 'Uploading video...', progress: 5 });

  const probePromise =
    !width || !height || !duration
      ? probeVideoDimensions(video.uri).catch(() => null)
      : Promise.resolve(null);

  const videoPromise = uploadReelVideo({
    uri: video.uri,
    fileName: video.fileName,
    contentType: video.mime,
    onProgress: (loaded, total) => {
      if (total > 0) {
        const pct = 5 + (loaded / total) * 70;
        setProgress(id, pct, 'Uploading video...');
      }
    },
  });

  const thumbPromise = thumbUri
    ? uploadReelThumbnail({ uri: thumbUri }).catch(() => undefined)
    : Promise.resolve<string | undefined>(undefined);

  const [probed, videoUrl, thumbnailUrl] = await Promise.all([
    probePromise,
    videoPromise,
    thumbPromise,
  ]);

  width = width ?? probed?.width;
  height = height ?? probed?.height;
  duration = duration ?? probed?.duration;

  const trimStartSec = video.trimStartSec ?? 0;
  const trimEndSec =
    video.trimEndSec ?? (typeof duration === 'number' ? duration : undefined);

  if (thumbUri) setProgress(id, 78, 'Uploading video & thumbnail...');

  setProgress(id, 90, 'Publishing reel...');
  updateTask(id, { status: 'publishing' });

  const safeDuration =
    typeof duration === 'number' && duration >= 0.5 ? duration : undefined;
  const effectiveDuration =
    trimEndSec != null && trimStartSec < trimEndSec
      ? trimEndSec - trimStartSec
      : safeDuration;

  const { reel }: { reel: ReelDTO } = await api.reels.create({
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    caption: caption?.trim() || undefined,
    duration: effectiveDuration,
    ...publishVisibility,
    ...soundPublishFields(draft),
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

      if (isImage) {
        const imageUrl = await uploadReelImage({
          uri: media.uri,
          fileName: media.fileName,
          contentType: media.mime,
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
          onProgress: (loaded, totalBytes) => {
            if (totalBytes > 0) {
              setProgress(id, basePct + (loaded / totalBytes) * span, `Uploading video ${i + 1}/${total}...`);
            }
          },
        }),
        media.thumbUri
          ? uploadReelThumbnail({ uri: media.thumbUri }).catch(() => undefined)
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
    media: uploaded,
  });

  await finalizePublishedReel(id, reel.id);
}

export function enqueueReelUpload(draft: ReelUploadDraft): ReelUploadTask {
  const task = createTask();
  tasks.set(task.id, task);
  taskDrafts.set(task.id, draft);
  queue.push({ id: task.id, draft });
  emit();
  pumpWorkers();
  return task;
}

export function retryReelUploadTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  const draft = taskDrafts.get(taskId);
  if (!task || !draft) return false;
  if (task.status !== 'error') return false;

  updateTask(taskId, {
    status: 'queued',
    stage: 'Queued for retry',
    progress: 0,
    error: undefined,
  });
  queue.push({ id: taskId, draft });
  emit();
  pumpWorkers();
  return true;
}

export function subscribeReelUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt));
  return () => listeners.delete(listener);
}

export function getReelUploadQueueSnapshot(): ReelUploadTask[] {
  return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}
