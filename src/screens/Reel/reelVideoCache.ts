import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { ReelDTO } from '../../lib/api';
import { getReelPlaybackUrl, isHlsUrl, stripMediaFragment } from '../../lib/reelPlayback';

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}reels-cache/`;
const PREFETCH_AHEAD = 10;
const MAX_CONCURRENT = 8;
const IS_WEB = Platform.OS === 'web';
const NATIVE_FILE_CACHE = !IS_WEB;

type CacheEntry = { localUri: string; blobUrl?: string };

type ReelLike = Pick<
  ReelDTO,
  'id' | 'video_url' | 'hls_url' | 'transcode_status' | 'playback_url'
>;

const memory = new Map<string, CacheEntry>();
const watchedReelIds = new Set<string>();
const inFlight = new Map<string, Promise<string>>();
let activeDownloads = 0;
const waitQueue: Array<() => void> = [];
let hydrateStarted = false;

function acquireSlot(): Promise<void> {
  if (activeDownloads < MAX_CONCURRENT) {
    activeDownloads += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeDownloads += 1;
      resolve();
    });
  });
}

function releaseSlot() {
  activeDownloads = Math.max(0, activeDownloads - 1);
  const next = waitQueue.shift();
  if (next) next();
}

async function ensureCacheDir() {
  if (!NATIVE_FILE_CACHE || !CACHE_DIR) return;
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

/** MP4 URL suitable for full-file cache (HLS stays streamed when no MP4). */
function mp4CacheUrl(reel: ReelLike): string | null {
  const mp4 = stripMediaFragment(reel.video_url);
  if (!mp4 || isHlsUrl(mp4)) return null;
  return mp4;
}

function cachedPlaybackUri(entry: CacheEntry): string {
  return entry.blobUrl ?? entry.localUri;
}

async function prefetchWebBlob(id: string, url: string): Promise<string> {
  const existing = memory.get(id);
  if (existing?.blobUrl) return existing.blobUrl;

  const pending = inFlight.get(id);
  if (pending) return pending;

  const task = (async () => {
    await acquireSlot();
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error(`prefetch ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      memory.set(id, { localUri: url, blobUrl });
      return blobUrl;
    } finally {
      releaseSlot();
    }
  })();

  inFlight.set(id, task);
  try {
    return await task;
  } finally {
    inFlight.delete(id);
  }
}

async function downloadReelNative(id: string, url: string): Promise<string> {
  const existing = memory.get(id);
  if (existing && !existing.localUri.startsWith('http')) {
    return cachedPlaybackUri(existing);
  }

  const pending = inFlight.get(id);
  if (pending) return pending;

  const task = (async () => {
    await acquireSlot();
    try {
      await ensureCacheDir();
      const path = `${CACHE_DIR}${id}.mp4`;
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        memory.set(id, { localUri: path });
        return path;
      }
      await FileSystem.downloadAsync(url, path);
      memory.set(id, { localUri: path });
      return path;
    } finally {
      releaseSlot();
    }
  })();

  inFlight.set(id, task);
  try {
    return await task;
  } finally {
    inFlight.delete(id);
  }
}

async function downloadReel(id: string, url: string): Promise<string> {
  if (IS_WEB) return prefetchWebBlob(id, url);
  return downloadReelNative(id, url);
}

/** Rehydrate in-memory index from on-disk MP4 files (survives app restarts). */
export async function hydrateReelCacheFromDisk(): Promise<void> {
  if (!NATIVE_FILE_CACHE || !CACHE_DIR || hydrateStarted) return;
  hydrateStarted = true;
  try {
    await ensureCacheDir();
    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.mp4')) continue;
      const id = file.slice(0, -4);
      if (!memory.has(id)) {
        memory.set(id, { localUri: `${CACHE_DIR}${file}` });
      }
    }
  } catch {
    /* cache dir may be unavailable */
  }
}

void hydrateReelCacheFromDisk();

export function markReelWatched(reelId: string): void {
  watchedReelIds.add(reelId);
}

export function isReelFullyCached(reelId: string): boolean {
  return memory.has(reelId);
}

export function getCachedReelUri(reelId: string, remoteUrl: string): string {
  const entry = memory.get(reelId);
  if (entry) return cachedPlaybackUri(entry);
  return remoteUrl;
}

/**
 * Playback URI: use local blob/file when cached (instant), otherwise stream
 * (MP4 on web to avoid HLS segment QUIC errors; HLS on native when ready).
 */
export function resolveReelPlaybackUri(reel: ReelLike): string {
  const entry = memory.get(reel.id);
  if (entry) return cachedPlaybackUri(entry);
  return getReelPlaybackUrl(reel);
}

/** Prioritize next reel, current (background), ahead queue, then previous. */
export function scheduleReelPrefetch(
  reels: ReelLike[],
  currentIndex: number,
  onCached: (reelId: string, localUri: string) => void
) {
  const tasks: Array<{ id: string; url: string; priority: number }> = [];

  const addTask = (reel: ReelLike | undefined, priority: number) => {
    if (!reel) return;
    const url = mp4CacheUrl(reel);
    if (!url) return;
    tasks.push({ id: reel.id, url, priority });
  };

  addTask(reels[currentIndex + 1], 0);
  addTask(reels[currentIndex], 0.25);

  for (let offset = 2; offset <= PREFETCH_AHEAD; offset += 1) {
    addTask(reels[currentIndex + offset], offset);
  }

  addTask(reels[currentIndex - 1], 0.5);

  for (const reel of reels) {
    if (watchedReelIds.has(reel.id)) {
      addTask(reel, 0.75);
    }
  }

  tasks.sort((a, b) => a.priority - b.priority);

  for (const task of tasks) {
    if (memory.has(task.id) || inFlight.has(task.id)) continue;
    void downloadReel(task.id, task.url)
      .then((uri) => onCached(task.id, uri))
      .catch(() => undefined);
  }
}

/** Warm the current reel MP4 in background while streaming plays. */
export function prefetchReelNow(
  reel: ReelLike,
  onCached: (reelId: string, localUri: string) => void
) {
  const url = mp4CacheUrl(reel);
  if (!url) return;
  if (memory.has(reel.id) || inFlight.has(reel.id)) return;
  void downloadReel(reel.id, url)
    .then((uri) => onCached(reel.id, uri))
    .catch(() => undefined);
}

export const REEL_RENDER_WINDOW = 1;

export function isReelNearViewport(index: number, currentIndex: number): boolean {
  return Math.abs(index - currentIndex) <= REEL_RENDER_WINDOW;
}
