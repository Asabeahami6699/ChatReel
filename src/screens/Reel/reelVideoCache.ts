import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}reels-cache/`;
const PREFETCH_AHEAD = 4;
const MAX_CONCURRENT = 2;

type CacheEntry = { localUri: string; blobUrl?: string };

const memory = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string>>();
let activeDownloads = 0;
const waitQueue: Array<() => void> = [];

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
  if (Platform.OS === 'web' || !CACHE_DIR) return;
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

async function downloadReel(id: string, url: string): Promise<string> {
  const existing = memory.get(id);
  if (existing) return existing.localUri;

  const pending = inFlight.get(id);
  if (pending) return pending;

  const task = (async () => {
    await acquireSlot();
    try {
      if (Platform.OS === 'web') {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`Prefetch failed (${res.status})`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        memory.set(id, { localUri: blobUrl, blobUrl });
        return blobUrl;
      }

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

export function getCachedReelUri(reelId: string, remoteUrl: string): string {
  return memory.get(reelId)?.localUri ?? remoteUrl;
}

/** Prioritize next reel, then ahead queue, then previous for swipe-back. */
export function scheduleReelPrefetch(
  reels: Array<{ id: string; video_url: string; hls_url?: string | null; transcode_status?: string; playback_url?: string }>,
  currentIndex: number,
  onCached: (reelId: string, localUri: string) => void
) {
  const tasks: Array<{ id: string; url: string; priority: number }> = [];

  const addTask = (reel: (typeof reels)[number] | undefined, priority: number) => {
    if (!reel) return;
    const url =
      reel.playback_url ??
      (reel.transcode_status === 'ready' && reel.hls_url ? reel.hls_url : reel.video_url);
    if (isHlsUrl(url)) return;
    tasks.push({ id: reel.id, url, priority });
  };

  addTask(reels[currentIndex + 1], 0);

  for (let offset = 2; offset <= PREFETCH_AHEAD; offset += 1) {
    addTask(reels[currentIndex + offset], offset);
  }

  addTask(reels[currentIndex - 1], 0.5);

  tasks.sort((a, b) => a.priority - b.priority);

  for (const task of tasks) {
    if (memory.has(task.id) || inFlight.has(task.id)) continue;
    void downloadReel(task.id, task.url)
      .then((uri) => onCached(task.id, uri))
      .catch(() => undefined);
  }
}

/** Warm the current reel immediately (e.g. on feed load). Skips HLS (streamed). */
export function prefetchReelNow(
  reel: { id: string; video_url: string; hls_url?: string | null; transcode_status?: string; playback_url?: string },
  onCached: (reelId: string, localUri: string) => void
) {
  const url =
    reel.playback_url ??
    (reel.transcode_status === 'ready' && reel.hls_url ? reel.hls_url : reel.video_url);
  if (isHlsUrl(url)) return;
  if (memory.has(reel.id) || inFlight.has(reel.id)) return;
  void downloadReel(reel.id, url)
    .then((uri) => onCached(reel.id, uri))
    .catch(() => undefined);
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url);
}

export const REEL_RENDER_WINDOW = 1;

export function isReelNearViewport(index: number, currentIndex: number): boolean {
  return Math.abs(index - currentIndex) <= REEL_RENDER_WINDOW;
}
