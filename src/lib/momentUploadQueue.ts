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

function createTask(): MomentUploadTask {
  const id = `moment-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    status: 'queued',
    stage: 'Queued',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function processOne(item: { id: string; draft: MomentUploadDraft }) {
  const { id, draft } = item;
  const mediaCount = draft.items.filter((i) => i.mediaType !== 'text').length;
  let uploaded = 0;

  updateTask(id, { status: 'uploading', stage: 'Uploading…', progress: 2 });

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
  const task = createTask();
  tasks.set(task.id, task);
  taskDrafts.set(task.id, draft);
  queue.push({ id: task.id, draft });
  emit();
  void runWorker();
  return task;
}

export function subscribeMomentUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt));
  return () => listeners.delete(listener);
}

export function getActiveMomentUploads(): MomentUploadTask[] {
  return Array.from(tasks.values()).filter(
    (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'publishing'
  );
}
