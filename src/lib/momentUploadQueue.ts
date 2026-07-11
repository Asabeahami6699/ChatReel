import { api, type MomentAudienceMode } from './api';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { uploadMomentMedia, uploadMomentThumbnail } from './momentUploader';
import { notifyRealtimeTopic } from './realtimeHub';

export type MomentUploadItem = {
  uri?: string;
  mediaType: 'image' | 'video' | 'text';
  fileName?: string;
  mime?: string;
  caption?: string;
  textBackground?: string;
  sound_id?: string;
  sound_start_sec?: number;
  original_audio_volume?: number;
  sound_volume?: number;
};

export type MomentUploadDraft = {
  items: MomentUploadItem[];
  duration_minutes: number;
  view_once: boolean;
  audience_mode: MomentAudienceMode;
  audience_ids?: string[];
};

export type MomentUploadStatus = 'queued' | 'uploading' | 'publishing' | 'done' | 'error';

export type MomentUploadTask = {
  id: string;
  status: MomentUploadStatus;
  stage: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
  /** Local preview for the strip thumbnail. */
  previewUri?: string | null;
  mediaType: 'image' | 'video' | 'text';
  textBackground?: string;
  caption?: string;
};

type Listener = (tasks: MomentUploadTask[]) => void;

const tasks = new Map<string, MomentUploadTask>();
const taskDrafts = new Map<string, MomentUploadDraft>();
const queue: Array<{ id: string; draft: MomentUploadDraft }> = [];
const listeners = new Set<Listener>();
let workerRunning = false;

function emit() {
  const list = Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  listeners.forEach((listener) => listener(list));
}

function updateTask(id: string, patch: Partial<MomentUploadTask>) {
  const existing = tasks.get(id);
  if (!existing) return;
  tasks.set(id, { ...existing, ...patch, updatedAt: Date.now() });
  emit();
}

function setProgress(id: string, progress: number, stage?: string) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  updateTask(id, { progress: clamped, ...(stage ? { stage } : {}) });
}

function previewFieldsFromDraft(draft: MomentUploadDraft): Pick<
  MomentUploadTask,
  'previewUri' | 'mediaType' | 'textBackground' | 'caption'
> {
  const first = draft.items[0];
  if (!first) {
    return { previewUri: null, mediaType: 'image' };
  }
  if (first.mediaType === 'text') {
    return {
      previewUri: null,
      mediaType: 'text',
      textBackground: first.textBackground,
      caption: first.caption,
    };
  }
  if (first.mediaType === 'image') {
    return { previewUri: first.uri ?? null, mediaType: 'image', caption: first.caption };
  }
  return { previewUri: null, mediaType: 'video', caption: first.caption };
}

async function hydrateVideoPreview(id: string, draft: MomentUploadDraft) {
  const first = draft.items.find((i) => i.mediaType === 'video' && i.uri);
  if (!first?.uri) return;
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(first.uri, {
      time: 200,
      quality: 0.65,
    });
    updateTask(id, { previewUri: uri });
  } catch {
    /* keep fallback icon */
  }
}

function createTask(draft: MomentUploadDraft): MomentUploadTask {
  const id = `moment-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    status: 'queued',
    stage: 'Queued',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...previewFieldsFromDraft(draft),
  };
}

function removeTask(id: string) {
  tasks.delete(id);
  taskDrafts.delete(id);
  emit();
}

async function processOne(item: { id: string; draft: MomentUploadDraft }) {
  const { id, draft } = item;
  const mediaCount = draft.items.filter((i) => i.mediaType !== 'text').length;
  let uploaded = 0;

  updateTask(id, { status: 'uploading', stage: 'Uploading…', progress: 2, error: undefined });

  const mediaItems: Array<{
    media_url?: string;
    media_type: 'image' | 'video' | 'text';
    caption?: string;
    text_background?: string;
    thumbnail_url?: string;
    sound_id?: string;
    sound_start_sec?: number;
    original_audio_volume?: number;
    sound_volume?: number;
  }> = [];

  for (let i = 0; i < draft.items.length; i++) {
    const itemDraft = draft.items[i];
    if (itemDraft.mediaType === 'text') {
      const text = itemDraft.caption?.trim();
      if (!text) throw new Error('Text moment cannot be empty');
      mediaItems.push({
        media_type: 'text',
        caption: text,
        text_background: itemDraft.textBackground ?? 'ocean',
      });
      continue;
    }

    if (!itemDraft.uri) throw new Error('Missing media file');

    const mediaUrl = await uploadMomentMedia({
      uri: itemDraft.uri,
      mediaType: itemDraft.mediaType,
      fileName: itemDraft.fileName,
      mime: itemDraft.mime,
      onProgress: (pct) => {
        const slice = mediaCount > 0 ? 70 / mediaCount : 70;
        const base = 5 + uploaded * slice;
        setProgress(id, base + (pct / 100) * slice, 'Uploading…');
      },
    });

    let thumbnailUrl: string | undefined;
    if (itemDraft.mediaType === 'video') {
      setProgress(id, 5 + uploaded * (mediaCount > 0 ? 70 / mediaCount : 70) + 2, 'Thumbnail…');
      try {
        const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(itemDraft.uri, {
          time: 500,
          quality: 0.7,
        });
        if (!tasks.get(id)?.previewUri) {
          updateTask(id, { previewUri: thumbUri });
        }
        thumbnailUrl = await uploadMomentThumbnail({ uri: thumbUri });
      } catch {
        thumbnailUrl = undefined;
      }
    }

    uploaded += 1;

    mediaItems.push({
      media_url: mediaUrl,
      media_type: itemDraft.mediaType,
      caption: itemDraft.caption?.trim() || undefined,
      thumbnail_url: thumbnailUrl,
      ...(itemDraft.mediaType !== 'text' && itemDraft.sound_id
        ? {
            sound_id: itemDraft.sound_id,
            sound_start_sec: itemDraft.sound_start_sec ?? 0,
            original_audio_volume: itemDraft.original_audio_volume ?? 1,
            sound_volume: itemDraft.sound_volume ?? 0.45,
          }
        : {}),
    });
  }

  setProgress(id, 88, 'Publishing moment…');
  updateTask(id, { status: 'publishing' });

  await api.moments.create({
    media_items: mediaItems,
    duration_minutes: draft.duration_minutes,
    view_once: draft.view_once,
    audience_mode: draft.audience_mode,
    audience_ids: draft.audience_ids,
  });

  notifyRealtimeTopic('moments');
  updateTask(id, { status: 'done', stage: 'Posted', progress: 100 });
  setTimeout(() => removeTask(id), 1800);
}

async function runWorker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        await processOne(item);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        updateTask(item.id, {
          status: 'error',
          stage: 'Failed',
          progress: 0,
          error: message,
        });
      }
    }
  } finally {
    workerRunning = false;
  }
}

export function enqueueMomentUpload(draft: MomentUploadDraft): MomentUploadTask {
  const task = createTask(draft);
  tasks.set(task.id, task);
  taskDrafts.set(task.id, draft);
  queue.push({ id: task.id, draft });
  emit();
  if (task.mediaType === 'video') {
    void hydrateVideoPreview(task.id, draft);
  }
  void runWorker();
  return task;
}

export function retryMomentUpload(taskId: string): boolean {
  const task = tasks.get(taskId);
  const draft = taskDrafts.get(taskId);
  if (!task || !draft || task.status !== 'error') return false;
  if (queue.some((q) => q.id === taskId)) return false;

  updateTask(taskId, {
    status: 'queued',
    stage: 'Queued',
    progress: 0,
    error: undefined,
  });
  queue.push({ id: taskId, draft });
  emit();
  void runWorker();
  return true;
}

export function dismissMomentUpload(taskId: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  if (task.status === 'queued' || task.status === 'uploading' || task.status === 'publishing') {
    return;
  }
  removeTask(taskId);
}

export function subscribeMomentUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt));
  return () => listeners.delete(listener);
}

export function getVisibleMomentUploads(): MomentUploadTask[] {
  return Array.from(tasks.values())
    .filter((t) => t.status !== 'done')
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getActiveMomentUploads(): MomentUploadTask[] {
  return Array.from(tasks.values()).filter(
    (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'publishing'
  );
}
