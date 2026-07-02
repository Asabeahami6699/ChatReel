import * as VideoThumbnails from 'expo-video-thumbnails';

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Client-side frame grab for moments that have no stored thumbnail_url. */
export async function getMomentVideoThumbnailUri(
  momentId: string,
  videoUrl: string
): Promise<string | null> {
  const cached = cache.get(momentId);
  if (cached) return cached;

  const inflight = pending.get(momentId);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, {
        time: 500,
        quality: 0.65,
      });
      cache.set(momentId, uri);
      return uri;
    } catch {
      return null;
    } finally {
      pending.delete(momentId);
    }
  })();

  pending.set(momentId, task);
  return task;
}

export function peekMomentVideoThumbnailUri(momentId: string): string | null {
  return cache.get(momentId) ?? null;
}
