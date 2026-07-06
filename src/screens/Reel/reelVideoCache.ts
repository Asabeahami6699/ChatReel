import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { ReelDTO } from '../../lib/api';
import { getReelPlaybackUrl, isHlsUrl } from '../../lib/reelPlayback';

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}reels-cache/`;
const PREFETCH_AHEAD = 4;
const MAX_CONCURRENT = 3;

/** Web browsers stream HLS/MP4 with range requests; full blob prefetch hits QUIC/CDN errors. */
const WEB_FILE_PREFETCH = Platform.OS !== 'web';

type CacheEntry = { localUri: string; blobUrl?: string };

type ReelLike = Pick<
  ReelDTO,
  'id' | 'video_url' | 'hls_url' | 'transcode_status' | 'playback_url'
>;

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

/** MP4 URL suitable for full-file cache (HLS stays streamed). */
function mp4CacheUrl(reel: ReelLike): string | null {
  const mp4 = reel.video_url;
  if (!mp4 || isHlsUrl(mp4)) return null;
  return mp4;
}

async function downloadReel(id: string, url: string): Promise<string> {
  if (!WEB_FILE_PREFETCH) {
    // Let the video element stream from the CDN on web.
    return url;
  }

  const existing = memory.get(id);
  if (existing) return existing.localUri;

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

export function isReelFullyCached(reelId: string): boolean {
  return memory.has(reelId);
}

export function getCachedReelUri(reelId: string, remoteUrl: string): string {
  return memory.get(reelId)?.localUri ?? remoteUrl;
}

/**
 * Playback URI: use local blob/file when cached (instant), otherwise stream
 * (HLS preferred when ready, else remote MP4).
 */
export function resolveReelPlaybackUri(reel: ReelLike): string {
  const cached = memory.get(reel.id)?.localUri;
  if (cached) return cached;
  return getReelPlaybackUrl(reel);
}

/** Prioritize next reel, current (background), ahead queue, then previous. */
export function scheduleReelPrefetch(
  reels: ReelLike[],
  currentIndex: number,
  onCached: (reelId: string, localUri: string) => void
) {
  if (!WEB_FILE_PREFETCH) return;

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
  if (!WEB_FILE_PREFETCH) return;
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
